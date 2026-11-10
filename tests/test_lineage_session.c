#include "test_framework.h"
#include "mcp/lineage_session.h"
#include "foundation/compat_fs.h"
#include "test_helpers.h"
#include "yyjson/yyjson.h"
#include <unistd.h>

/* Also buildable as a small standalone regression executable, without the
 * parser grammars or embedded Python. Uses the production SQLite/FS code. */
#ifdef CBM_LINEAGE_SESSION_STANDALONE
int tf_pass_count,tf_fail_count,tf_skip_count,tf_deselected_count;
const char *tf_current_suite;
bool tf_suite_enter(const char *s) {tf_current_suite=s;return true;}
void tf_suite_leave(const char *s) {(void)s;}
bool tf_test_selected(const char *s) {(void)s;return true;}
#endif

static char *lineage_request(sqlite3 *graph,const char *dir,const char *extra,bool *error) {
    char args[8192];
    snprintf(args,sizeof(args),"{\"project\":\"p\",\"generation\":\"v1\",\"session\":\"test\",\"output_dir\":\"%s\",%s}",dir,extra);
    return cbm_lineage_session(graph,"p",args,error);
}
static int64_t lineage_count(const char *response,const char *key) {
    yyjson_doc *d=yyjson_read(response,strlen(response),0);
    int64_t n=yyjson_get_sint(yyjson_obj_get(yyjson_doc_get_root(d),key));
    yyjson_doc_free(d);return n;
}

TEST(lineage_session_transaction_resume_dedup_and_export) {
    char *directory=th_mktempdir("cbm_lineage_test");
    ASSERT_NOT_NULL(directory);
    sqlite3 *graph=NULL;
    ASSERT_EQ(sqlite3_open(":memory:",&graph),SQLITE_OK);
    ASSERT_EQ(sqlite3_exec(graph,
        "CREATE TABLE projects(name TEXT,indexed_at TEXT);INSERT INTO projects VALUES('p','v1');"
        "CREATE TABLE store_meta(k TEXT PRIMARY KEY,v TEXT);"
        "INSERT INTO store_meta VALUES('db_uid','0000000000000001'),('mutation_gen','1');"
        "CREATE TABLE nodes(id INTEGER,project TEXT,label TEXT,name TEXT,properties TEXT);"
        "CREATE TABLE edges(source_id INTEGER,target_id INTEGER,project TEXT,type TEXT);"
        "INSERT INTO nodes VALUES(1,'p','SqlStatement','insert','{}'),"
        "(2,'p','SqlTableRef','raw.a','{}'),(3,'p','SqlTableRef','mart.b','{}'),"
        "(4,'other','SqlTableRef','bad.foreign','{}'),(5,'p','SqlTableRef','bad.unowned','{}');"
        "INSERT INTO edges VALUES(1,2,'p','HAS_SOURCE_REF'),(1,3,'p','HAS_TARGET_REF');",
        NULL,NULL,NULL),SQLITE_OK);
    bool error=false;
    char *r=lineage_request(graph,directory,"\"action\":\"init\"",&error);
    ASSERT_FALSE(error);free(r);
    const char *put="\"action\":\"put\",\"decisions\":[{\"decision_id\":\"one\",\"statement_id\":1,\"status\":\"emit\",\"evidence\":\"job.sql:1\",\"rows\":[{\"source_id\":2,\"target_id\":3,\"kind\":\"insert\"}]}]";
    r=lineage_request(graph,directory,put,&error);ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),1);free(r);
    r=lineage_request(graph,directory,put,&error);ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"decisions_total"),1);free(r);
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"two\",\"status\":\"emit\",\"evidence\":\"other.sql:2\",\"rows\":[{\"source\":\"raw.a\",\"target\":\"mart.b\",\"kind\":\"insert\"}]}]",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),1);free(r);
    /* Unconnected endpoints are accepted: the collector never traverses edges. */
    ASSERT_EQ(sqlite3_exec(graph,"DROP TABLE edges",NULL,NULL,NULL),SQLITE_OK);
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"one\",\"statement_id\":1,\"status\":\"emit\",\"evidence\":\"job.sql:1\",\"rows\":[{\"source_id\":5,\"target_id\":3,\"kind\":\"insert\"}]}]",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),2);free(r);
    r=lineage_request(graph,directory,put,&error);ASSERT_FALSE(error);free(r);
    /* Foreign-project IDs still cannot be translated; replacement rolls back. */
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"one\",\"status\":\"emit\",\"evidence\":\"job.sql:1\",\"rows\":[{\"source_id\":4,\"target_id\":3,\"kind\":\"insert\"}]}]",&error);
    ASSERT_TRUE(error);free(r);
    r=lineage_request(graph,directory,"\"action\":\"remove\",\"decisions\":[{\"decision_id\":\"two\"}]",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),1);ASSERT_EQ(lineage_count(r,"decisions_total"),1);free(r);
    r=lineage_request(graph,directory,"\"action\":\"init\"",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),1);free(r);
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"gap\",\"status\":\"unresolved\",\"evidence\":\"job.sql:8\",\"reason\":\"external parameter\"}]",&error);
    ASSERT_FALSE(error);free(r);
    r=lineage_request(graph,directory,"\"action\":\"export\"",&error);ASSERT_TRUE(error);free(r);
    r=lineage_request(graph,directory,"\"action\":\"export\",\"allow_partial\":true",&error);ASSERT_FALSE(error);free(r);
    char path[4096];snprintf(path,sizeof(path),"%s/table_lineage.tsv",directory);
    FILE *f=fopen(path,"rb");ASSERT_NOT_NULL(f);
    char data[256]={0};size_t n=fread(data,1,sizeof(data)-1,f);fclose(f);ASSERT_GT(n,0);
    ASSERT_STR_EQ(data,"source\ttarget\tkind\nraw.a\tmart.b\tinsert\n");
    r=lineage_request(graph,directory,"\"action\":\"export\",\"allow_partial\":true",&error);ASSERT_TRUE(error);free(r);
    r=lineage_request(graph,directory,"\"action\":\"status\",\"limit\":1",&error);
    ASSERT_FALSE(error);ASSERT_NOT_NULL(strstr(r,"\"has_more\":true"));ASSERT_NULL(strstr(r,"\"rows\":["));free(r);
    /* The whole batch is atomic, not only each individual decision. */
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"one\",\"status\":\"skip\",\"evidence\":\"job.sql:1\",\"reason\":\"test rollback\"},{\"decision_id\":\"invalid\",\"status\":\"emit\",\"evidence\":\"job.sql:1\",\"rows\":[{\"source\":\"\",\"target\":\"mart.b\",\"kind\":\"insert\"}]}]",&error);
    ASSERT_TRUE(error);free(r);
    r=lineage_request(graph,directory,"\"action\":\"status\"",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),1);ASSERT_EQ(lineage_count(r,"decisions_total"),2);free(r);
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"column\",\"level\":\"column\",\"status\":\"emit\",\"evidence\":\"job.sql:2\",\"rows\":[{\"target_table\":\"mart.b\",\"target_column\":\"c\",\"target_type\":\"-\",\"workflow\":\"-\",\"source_table\":\"raw.a\",\"source_columns\":\"c\",\"expression\":\"a.c\\n+\\t1\",\"file\":\"job.sql\",\"line\":2}]}]",&error);
    ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"column_rows"),1);free(r);
    r=lineage_request(graph,directory,"\"action\":\"export\",\"level\":\"column\",\"allow_partial\":true",&error);
    ASSERT_FALSE(error);free(r);
    char column_path[4096];snprintf(column_path,sizeof(column_path),"%s/column_lineage.tsv",directory);
    f=fopen(column_path,"rb");ASSERT_NOT_NULL(f);
    memset(data,0,sizeof(data));n=fread(data,1,sizeof(data)-1,f);fclose(f);ASSERT_GT(n,0);
    ASSERT_STR_EQ(data,"target_table\ttarget_column\ttarget_type\tworkflow\tsource_table\tsource_columns\texpression\tfile\tline\nmart.b\tc\t-\t-\traw.a\tc\ta.c\\n+\\t1\tjob.sql\t2\n");
    ASSERT_EQ(unlink(column_path),0);
    /* Dynamic names are evidence, not a collector error. Literal/ID forms
     * deduplicate and export without requiring allow_partial. */
    ASSERT_EQ(sqlite3_exec(graph,
        "INSERT INTO nodes VALUES(6,'p','SqlTableRef','${schema}.orders','{\"ref_kind\":\"dynamic\"}'),"
        "(7,'p','SqlTableRef','q','{\"ref_kind\":\"cte\"}');",NULL,NULL,NULL),SQLITE_OK);
    r=lineage_request(graph,directory,"\"action\":\"remove\",\"decisions\":[{\"decision_id\":\"gap\"}]",&error);
    ASSERT_FALSE(error);free(r);
    const char *dynamic="\"action\":\"put\",\"decisions\":[{\"decision_id\":\"dynamic\",\"status\":\"emit\",\"evidence\":\"job.sql:9\",\"reason\":\"external schema parameter\",\"rows\":[{\"source\":\"${schema}.orders\",\"target\":\"{{mart}}.orders\",\"kind\":\"insert\"},{\"source_id\":6,\"target\":\"{{mart}}.orders\",\"kind\":\"insert\"}]}]";
    r=lineage_request(graph,directory,dynamic,&error);ASSERT_FALSE(error);ASSERT_EQ(lineage_count(r,"table_rows"),2);free(r);
    r=lineage_request(graph,directory,"\"action\":\"export\",\"overwrite\":true",&error);ASSERT_FALSE(error);free(r);
    f=fopen(path,"rb");ASSERT_NOT_NULL(f);
    memset(data,0,sizeof(data));n=fread(data,1,sizeof(data)-1,f);fclose(f);ASSERT_GT(n,0);
    ASSERT_STR_EQ(data,"source\ttarget\tkind\n${schema}.orders\t{{mart}}.orders\tinsert\nraw.a\tmart.b\tinsert\n");
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[{\"decision_id\":\"cte\",\"status\":\"emit\",\"evidence\":\"job.sql:9\",\"rows\":[{\"source_id\":7,\"target_id\":3,\"kind\":\"insert\"}]}]",&error);
    ASSERT_TRUE(error);free(r);
    /* A mutation in the SAME timestamp second still invalidates the session. */
    ASSERT_EQ(sqlite3_exec(graph,"UPDATE store_meta SET v='2' WHERE k='mutation_gen'",NULL,NULL,NULL),SQLITE_OK);
    r=lineage_request(graph,directory,"\"action\":\"put\",\"decisions\":[]",&error);ASSERT_TRUE(error);free(r);
    sqlite3_close(graph);
    ASSERT_EQ(unlink(path),0);
    snprintf(path,sizeof(path),"%s/.cbm-lineage-test.sqlite",directory);ASSERT_EQ(unlink(path),0);
    ASSERT_EQ(cbm_rmdir(directory),0);
    PASS();
}

SUITE(lineage_session) { RUN_TEST(lineage_session_transaction_resume_dedup_and_export); }
#ifdef CBM_LINEAGE_SESSION_STANDALONE
int main(void) { RUN_SUITE(lineage_session); return tf_fail_count ? 1 : 0; }
#endif
