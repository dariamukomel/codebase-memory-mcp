#ifndef TEST_SQL_DIALECT_PROFILE_H
#define TEST_SQL_DIALECT_PROFILE_H
#include "pipeline/sql_dialect_profile.h"
#include "sql_dialect.h"

TEST(sql_dialect_markers_are_lexical) {
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX];
    const char *negative[] = {"select datediff(a,b) from t", "select my_iff(a,b,c)",
        "select 'IFF(a,b,c)', \"VARIANT\" -- QUALIFY\nfrom t /* USING DELTA */",
        "select $$ IFF(a,b,c) $$", "select $body$ QUALIFY $body$"};
    for (size_t i = 0; i < sizeof(negative)/sizeof(negative[0]); i++)
        ASSERT_EQ(cbm_sql_dialect_candidates(negative[i], strlen(negative[i]), candidates), 0);
    const char *positive = "select iff (a,b,c) from t";
    ASSERT_EQ(cbm_sql_dialect_candidates(positive, strlen(positive), candidates), 1);
    ASSERT_STR_EQ(candidates[0].name, "snowflake");
    positive = "select * from t lateral\nview explode(a)";
    ASSERT_EQ(cbm_sql_dialect_candidates(positive, strlen(positive), candidates), 2);
    PASS();
}

TEST(sql_dialect_config_values_are_exact_and_directory_scoped) {
    char *dir = th_mktempdir("cbm-dialects");
    ASSERT_NOT_NULL(dir);
    const char *paths[] = {"settings.json", "a/settings.yml", "b/settings.toml",
                          "c/settings.ini", "root.sql", "a/job.sql", "b/job.sql", "c/job.sql"};
    const char *texts[] = {"{\"dialect\":\"hive\",\"note\":\"spark\"}",
        "# dialect: oracle\nsql_dialect: spark # hive\n",
        "sql_dialect = 'postgres' # spark\n", "sql-dialect = mysql ; hive\n",
        "SELECT * FROM t", "SELECT * FROM t", "SELECT * FROM t", "SELECT * FROM t"};
    cbm_file_info_t files[8] = {0};
    for (int i = 0; i < 8; i++) {
        files[i].rel_path = (char *)paths[i]; files[i].path = strdup(TH_PATH(dir, paths[i]));
        if (i >= 4) files[i].language = CBM_LANG_SQL;
        ASSERT_EQ(th_write_file(files[i].path, texts[i]), 0);
    }
    CBMSqlDialectProfile *p = cbm_sql_dialect_profile_build(files, 8);
    ASSERT_NOT_NULL(p);
    const char *expected[] = {"hive", "spark", "postgres", "mysql"};
    for (int i = 4; i < 8; i++) {
        const char *source = NULL;
        ASSERT_STR_EQ(cbm_sql_dialect_profile_hint(p, i, &source), expected[i - 4]);
        ASSERT_STR_EQ(source, "config");
    }
    cbm_sql_dialect_profile_free(p);
    for (int i = 0; i < 8; i++) free(files[i].path);
    th_rmtree(dir);
    PASS();
}

TEST(sql_dialect_ignores_comment_and_neighbor_values) {
    char *dir = th_mktempdir("cbm-dialects");
    ASSERT_NOT_NULL(dir);
    char *config = strdup(TH_PATH(dir, "settings.json"));
    char *sql = strdup(TH_PATH(dir, "job.sql"));
    ASSERT_EQ(th_write_file(config, "{\"dialect\":\"unknown\",\"note\":\"spark\"}"), 0);
    ASSERT_EQ(th_write_file(sql, "SELECT * FROM t"), 0);
    cbm_file_info_t files[] = {{.path=config,.rel_path="settings.json"},
                              {.path=sql,.rel_path="job.sql",.language=CBM_LANG_SQL}};
    CBMSqlDialectProfile *p = cbm_sql_dialect_profile_build(files, 2);
    ASSERT_NOT_NULL(p);
    ASSERT_NULL(cbm_sql_dialect_profile_hint(p, 1, NULL));
    cbm_sql_dialect_profile_free(p);
    free(config); free(sql); th_rmtree(dir);
    PASS();
}

TEST(sql_dialect_fallback_order_uses_project_votes_and_directory) {
    char *dir = th_mktempdir("cbm-dialects");
    ASSERT_NOT_NULL(dir);
    const char *paths[] = {"a/c.json", "a/q.sql", "b/c.json", "b/q.sql", "mixed/q.sql"};
    const char *texts[] = {"{\"dialect\":\"spark\"}", "SELECT 1",
                          "{\"dialect\":\"spark\"}", "SELECT 1",
                          "CREATE TABLE t(x INT) STORED AS PARQUET"};
    cbm_file_info_t files[5] = {0};
    for (int i = 0; i < 5; i++) {
        files[i].rel_path = (char *)paths[i]; files[i].path = strdup(TH_PATH(dir, paths[i]));
        if (i == 1 || i == 3 || i == 4) files[i].language = CBM_LANG_SQL;
        ASSERT_EQ(th_write_file(files[i].path, texts[i]), 0);
    }
    CBMSqlDialectProfile *p = cbm_sql_dialect_profile_build(files, 5);
    ASSERT_NOT_NULL(p);
    cbm_sql_dialect_profile_apply_path(p, "mixed/q.sql");
    ASSERT_STR_EQ(cbm_sql_dialect_hint_get(NULL), "spark");
    CBMSqlDialectCandidate c[] = {{"hive", 9}, {"spark", 1}};
    cbm_sql_dialect_order_candidates(c, 2);
    ASSERT_STR_EQ(c[0].name, "spark");
    const char *ranked[] = {"spark", "hive"};
    cbm_sql_dialect_preferences_set("hive", ranked, 2);
    cbm_sql_dialect_order_candidates(c, 2);
    ASSERT_STR_EQ(c[0].name, "hive");
    cbm_sql_dialect_hint_set(NULL, NULL);
    cbm_sql_dialect_profile_free(p);
    for (int i = 0; i < 5; i++) free(files[i].path);
    th_rmtree(dir);
    PASS();
}
#endif
