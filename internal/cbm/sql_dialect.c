#include "sql_dialect.h"

#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern const TSLanguage *tree_sitter_sql(void);
extern const TSLanguage *tree_sitter_postgres_sql(void);
extern const TSLanguage *tree_sitter_cockroachdb_sql(void);
extern const TSLanguage *tree_sitter_mysql_sql(void);
extern const TSLanguage *tree_sitter_mariadb_sql(void);
extern const TSLanguage *tree_sitter_sqlite_sql(void);
extern const TSLanguage *tree_sitter_oracle_sql(void);
extern const TSLanguage *tree_sitter_db2_sql(void);
extern const TSLanguage *tree_sitter_tsql(void);
extern const TSLanguage *tree_sitter_hana_sql(void);
extern const TSLanguage *tree_sitter_teradata_sql(void);
extern const TSLanguage *tree_sitter_bigquery_sql(void);
extern const TSLanguage *tree_sitter_spanner_sql(void);
extern const TSLanguage *tree_sitter_snowflake_sql(void);
extern const TSLanguage *tree_sitter_redshift_sql(void);
extern const TSLanguage *tree_sitter_duckdb_sql(void);
extern const TSLanguage *tree_sitter_clickhouse_sql(void);
extern const TSLanguage *tree_sitter_trino_sql(void);
extern const TSLanguage *tree_sitter_athena_sql(void);
extern const TSLanguage *tree_sitter_flink_sql(void);
extern const TSLanguage *tree_sitter_hive_sql(void);
extern const TSLanguage *tree_sitter_spark_sql(void);
extern const TSLanguage *tree_sitter_databricks_sql(void);

typedef const TSLanguage *(*SqlFactory)(void);
typedef struct {
    const char *name;
    SqlFactory factory;
} SqlDialect;

enum {
    SQL_ANSI,
    SQL_POSTGRES,
    SQL_COCKROACHDB,
    SQL_MYSQL,
    SQL_MARIADB,
    SQL_SQLITE,
    SQL_ORACLE,
    SQL_DB2,
    SQL_TSQL,
    SQL_HANA,
    SQL_TERADATA,
    SQL_BIGQUERY,
    SQL_SPANNER,
    SQL_SNOWFLAKE,
    SQL_REDSHIFT,
    SQL_DUCKDB,
    SQL_CLICKHOUSE,
    SQL_TRINO,
    SQL_ATHENA,
    SQL_FLINK,
    SQL_HIVE,
    SQL_SPARK,
    SQL_DATABRICKS,
};

static const SqlDialect DIALECTS[] = {
    {"ansi", tree_sitter_sql},
    {"postgres", tree_sitter_postgres_sql},
    {"cockroachdb", tree_sitter_cockroachdb_sql},
    {"mysql", tree_sitter_mysql_sql},
    {"mariadb", tree_sitter_mariadb_sql},
    {"sqlite", tree_sitter_sqlite_sql},
    {"oracle", tree_sitter_oracle_sql},
    {"db2", tree_sitter_db2_sql},
    {"tsql", tree_sitter_tsql},
    {"hana", tree_sitter_hana_sql},
    {"teradata", tree_sitter_teradata_sql},
    {"bigquery", tree_sitter_bigquery_sql},
    {"spanner", tree_sitter_spanner_sql},
    {"snowflake", tree_sitter_snowflake_sql},
    {"redshift", tree_sitter_redshift_sql},
    {"duckdb", tree_sitter_duckdb_sql},
    {"clickhouse", tree_sitter_clickhouse_sql},
    {"trino", tree_sitter_trino_sql},
    {"athena", tree_sitter_athena_sql},
    {"flink", tree_sitter_flink_sql},
    {"hive", tree_sitter_hive_sql},
    {"spark", tree_sitter_spark_sql},
    {"databricks", tree_sitter_databricks_sql},
};

/* Auto-detection is a bounded preflight, not a second full indexing pass. */
enum { DIALECT_COUNT = (int)(sizeof(DIALECTS) / sizeof(DIALECTS[0])), PROBE_LIMIT = 64 * 1024 };

static bool eq_normalized(const char *a, const char *b) {
    if (!a || !b) return false;
    while (true) {
        while (*a == '-' || *a == '_' || *a == ' ') a++;
        while (*b == '-' || *b == '_' || *b == ' ') b++;
        if (!*a || !*b) break;
        unsigned char ca = (unsigned char)*a++;
        unsigned char cb = (unsigned char)*b++;
        if (tolower(ca) != tolower(cb)) return false;
    }
    while (*a == '-' || *a == '_' || *a == ' ') a++;
    while (*b == '-' || *b == '_' || *b == ' ') b++;
    return *a == '\0' && *b == '\0';
}

static int dialect_index(const char *name) {
    if (!name || !*name) return -1;
    if (eq_normalized(name, "sql") || eq_normalized(name, "generic") ||
        eq_normalized(name, "base")) return 0;
    if (eq_normalized(name, "postgresql") || eq_normalized(name, "pgsql")) return 1;
    if (eq_normalized(name, "cockroach")) return 2;
    if (eq_normalized(name, "mssql") || eq_normalized(name, "sqlserver")) return 8;
    if (eq_normalized(name, "sap-hana")) return 9;
    if (eq_normalized(name, "bq")) return 11;
    for (int i = 0; i < DIALECT_COUNT; i++) {
        if (eq_normalized(name, DIALECTS[i].name)) return i;
    }
    return -1;
}

const TSLanguage *cbm_sql_dialect_language(const char *name) {
    int i = dialect_index(name);
    return i < 0 ? NULL : DIALECTS[i].factory();
}

const char *cbm_sql_dialect_canonical_name(const char *name) {
    int i = dialect_index(name);
    return i < 0 ? NULL : DIALECTS[i].name;
}

static bool ascii_contains(const char *text, size_t len, const char *needle) {
    size_t n = strlen(needle);
    if (!n || n > len) return false;
    for (size_t i = 0; i + n <= len; i++) {
        size_t j = 0;
        for (; j < n; j++) {
            if (tolower((unsigned char)text[i + j]) != tolower((unsigned char)needle[j])) break;
        }
        if (j == n) return true;
    }
    return false;
}

static bool directive_marker_at(const char *source, size_t scan, size_t at) {
    static const char marker[] = "cbm:dialect=";
    if (at + sizeof(marker) - 1 > scan) return false;
    for (size_t j = 0; j < sizeof(marker) - 1; j++) {
        if (tolower((unsigned char)source[at + j]) != marker[j]) return false;
    }
    return true;
}

static int directive_value(const char *source, size_t scan, size_t at,
                           char *out, size_t out_cap) {
    static const size_t marker_len = sizeof("cbm:dialect=") - 1;
    size_t p = at + marker_len, w = 0;
    while (p < scan && w + 1 < out_cap) {
        unsigned char c = (unsigned char)source[p++];
        if (!(isalnum(c) || c == '_' || c == '-')) break;
        out[w++] = (char)c;
    }
    out[w] = '\0';
    if (!w) return -2;
    int dialect = dialect_index(out);
    return dialect >= 0 ? dialect : -2;
}

/* Directives are configuration, not SQL data.  Accept them only in actual
 * line/block comments so a string literal such as
 * `SELECT 'cbm:dialect=snowflake'` cannot silently switch the parser. */
static int explicit_directive(const char *source, size_t len, char *out, size_t out_cap) {
    size_t scan = len < 4096 ? len : 4096;
    bool line_comment = false, block_comment = false;
    unsigned char quote = 0;
    for (size_t i = 0; i < scan; i++) {
        unsigned char c = (unsigned char)source[i];
        unsigned char next = i + 1 < scan ? (unsigned char)source[i + 1] : 0;
        if (line_comment) {
            if (c == '\r' || c == '\n') {
                line_comment = false;
            } else if (directive_marker_at(source, scan, i)) {
                return directive_value(source, scan, i, out, out_cap);
            }
            continue;
        }
        if (block_comment) {
            if (c == '*' && next == '/') {
                block_comment = false;
                i++;
            } else if (directive_marker_at(source, scan, i)) {
                return directive_value(source, scan, i, out, out_cap);
            }
            continue;
        }
        if (quote) {
            if (c == '\\' && i + 1 < scan) {
                i++;
            } else if (c == quote) {
                if (next == quote) i++;
                else quote = 0;
            }
            continue;
        }
        if (c == '-' && next == '-') {
            line_comment = true;
            i++;
        } else if (c == '/' && next == '*') {
            block_comment = true;
            i++;
        } else if (c == '\'' || c == '"' || c == '`') {
            quote = c;
        }
    }
    return -1;
}

static void add_score(int *scores, int dialect, int amount) {
    if (dialect >= 0 && dialect < DIALECT_COUNT) scores[dialect] += amount;
}

static bool path_has_component(const char *path, const char *component) {
    if (!path || !component) return false;
    size_t path_len = strlen(path), component_len = strlen(component);
    for (size_t i = 0; i + component_len <= path_len; i++) {
        bool left = i == 0 || path[i - 1] == '/' || path[i - 1] == '\\';
        bool right = i + component_len == path_len || path[i + component_len] == '/' ||
                     path[i + component_len] == '\\';
        if (left && right && ascii_contains(path + i, component_len, component)) return true;
    }
    return false;
}

static void score_path(int *scores, const char *path) {
    if (!path) return;
    for (int i = 1; i < DIALECT_COUNT; i++) {
        if (path_has_component(path, DIALECTS[i].name)) add_score(scores, i, 30);
    }
    size_t n = strlen(path);
    if (n >= 4 && ascii_contains(path + n - 4, 4, ".hql")) add_score(scores, SQL_HIVE, 35);
    if (path_has_component(path, "spark") || ascii_contains(path, n, "spark_sql")) {
        add_score(scores, SQL_SPARK, 35);
    }
}

static void score_syntax(int *s, const char *x, size_t n) {
    /* A hint only creates a small candidate set. Parse quality makes the final
     * decision, so shared syntax does not permanently misclassify a file. */
    if (ascii_contains(x, n, "insert overwrite") || ascii_contains(x, n, "create temporary view") ||
        ascii_contains(x, n, " using parquet") || ascii_contains(x, n, " using delta")) {
        add_score(s, SQL_SPARK, 24);
        add_score(s, SQL_DATABRICKS, 28);
        add_score(s, SQL_HIVE, 18);
    }
    if (ascii_contains(x, n, "qualify ") || ascii_contains(x, n, "create or replace transient")) {
        add_score(s, SQL_SNOWFLAKE, 28);
        add_score(s, SQL_BIGQUERY, 10);
    }
    if (ascii_contains(x, n, "unnest(") || ascii_contains(x, n, "safe_cast(") ||
        ascii_contains(x, n, "create or replace table")) add_score(s, SQL_BIGQUERY, 25);
    if (ascii_contains(x, n, "top (") || ascii_contains(x, n, "nvarchar") ||
        ascii_contains(x, n, "with (nolock)")) add_score(s, SQL_TSQL, 25);
    if (ascii_contains(x, n, "on conflict") || ascii_contains(x, n, "returning ") ||
        ascii_contains(x, n, "::json")) add_score(s, SQL_POSTGRES, 22);
    if (ascii_contains(x, n, "engine =") || ascii_contains(x, n, "array join")) add_score(s, SQL_CLICKHOUSE, 26);
    if (ascii_contains(x, n, "pragma ") || ascii_contains(x, n, "without rowid")) add_score(s, SQL_SQLITE, 28);
    if (ascii_contains(x, n, "connect by") || ascii_contains(x, n, "varchar2")) add_score(s, SQL_ORACLE, 28);
    if (ascii_contains(x, n, "distribution key") || ascii_contains(x, n, "column table")) add_score(s, SQL_HANA, 24);
    if (ascii_contains(x, n, "volatile table") || ascii_contains(x, n, "collect statistics")) add_score(s, SQL_TERADATA, 28);
    if (ascii_contains(x, n, "auto_increment") || ascii_contains(x, n, "straight_join")) add_score(s, SQL_MYSQL, 22);
    if (ascii_contains(x, n, "distkey") || ascii_contains(x, n, "sortkey")) add_score(s, SQL_REDSHIFT, 28);
    if (ascii_contains(x, n, "from read_parquet") || ascii_contains(x, n, "exclude (")) add_score(s, SQL_DUCKDB, 20);
    if (ascii_contains(x, n, "connector =") || ascii_contains(x, n, "watermark for")) add_score(s, SQL_FLINK, 28);
}

typedef struct { uint64_t error_bytes; uint32_t errors; uint32_t missing; uint32_t statements; } ParseQuality;

static ParseQuality inspect_tree(TSNode root) {
    ParseQuality q = {0};
    TSTreeCursor cursor = ts_tree_cursor_new(root);
    bool running = true;
    while (running) {
        TSNode node = ts_tree_cursor_current_node(&cursor);
        if (ts_node_is_named(node)) {
            const char *type = ts_node_type(node);
            if (strcmp(type, "ERROR") == 0) {
                q.errors++;
                q.error_bytes += ts_node_end_byte(node) - ts_node_start_byte(node);
            }
            if (ts_node_is_missing(node)) q.missing++;
            if (strcmp(type, "statement") == 0) q.statements++;
        }
        if (ts_tree_cursor_goto_first_child(&cursor)) continue;
        while (!ts_tree_cursor_goto_next_sibling(&cursor)) {
            if (!ts_tree_cursor_goto_parent(&cursor)) { running = false; break; }
        }
    }
    ts_tree_cursor_delete(&cursor);
    return q;
}

static int64_t parse_rank(const TSLanguage *language, const char *source, size_t len,
                          int lexical_score) {
    TSParser *parser = ts_parser_new();
    if (!parser || !ts_parser_set_language(parser, language)) {
        if (parser) ts_parser_delete(parser);
        return INT64_MIN;
    }
    size_t probe_len = len < PROBE_LIMIT ? len : PROBE_LIMIT;
    TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)probe_len);
    int64_t rank = INT64_MIN;
    if (tree) {
        ParseQuality q = inspect_tree(ts_tree_root_node(tree));
        /* Hints select candidates and break close ties; they must never make a
         * visibly worse parse beat a clean generic parse. */
        rank = (int64_t)lexical_score + (int64_t)q.statements * 1000 -
               (int64_t)q.error_bytes * 16 - (int64_t)q.errors * 4000 -
               (int64_t)q.missing * 6000;
        ts_tree_delete(tree);
    }
    ts_parser_delete(parser);
    return rank;
}

CBMSqlDialectChoice cbm_sql_dialect_choose(const char *source, size_t source_len,
                                           const char *rel_path) {
    CBMSqlDialectChoice out = {"ansi", tree_sitter_sql(), false};
    if (!source) return out;

    char directive[48];
    int explicit_index = explicit_directive(source, source_len, directive, sizeof(directive));
    const char *env = getenv("CBM_SQL_DIALECT");
    if (explicit_index == -1 && env && *env && !eq_normalized(env, "auto")) {
        explicit_index = dialect_index(env);
    }
    if (explicit_index >= 0) {
        out.name = DIALECTS[explicit_index].name;
        out.language = DIALECTS[explicit_index].factory();
        out.explicit_selection = true;
        return out;
    }

    int scores[DIALECT_COUNT];
    memset(scores, 0, sizeof(scores));
    score_path(scores, rel_path);
    score_syntax(scores, source, source_len < PROBE_LIMIT ? source_len : PROBE_LIMIT);

    int candidates[5] = {0, -1, -1, -1, -1};
    for (int slot = 1; slot < 5; slot++) {
        int best = -1;
        for (int i = 1; i < DIALECT_COUNT; i++) {
            bool used = false;
            for (int j = 1; j < slot; j++) if (candidates[j] == i) used = true;
            if (!used && scores[i] > 0 && (best < 0 || scores[i] > scores[best])) best = i;
        }
        candidates[slot] = best;
    }
    if (candidates[1] < 0) return out;

    int best = 0;
    int64_t best_rank = parse_rank(DIALECTS[0].factory(), source, source_len, 0);
    for (int slot = 1; slot < 5 && candidates[slot] >= 0; slot++) {
        int candidate = candidates[slot];
        int64_t rank = parse_rank(DIALECTS[candidate].factory(), source, source_len,
                                  scores[candidate]);
        if (rank > best_rank) { best = candidate; best_rank = rank; }
    }
    out.name = DIALECTS[best].name;
    out.language = DIALECTS[best].factory();
    return out;
}
