/* Mechanical persistence of AGENT decisions, not a lineage inference engine. */
#include "mcp/lineage_session.h"
#include "foundation/compat.h"
#include "foundation/compat_fs.h"
#include "yyjson/yyjson.h"
#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

const char cbm_lineage_session_schema[] =
    "{\"type\":\"object\",\"properties\":{"
    "\"project\":{\"type\":\"string\"},\"generation\":{\"type\":\"string\"},"
    "\"session\":{\"type\":\"string\",\"pattern\":\"^[A-Za-z0-9_-]{1,64}$\"},"
    "\"output_dir\":{\"type\":\"string\"},"
    "\"action\":{\"type\":\"string\",\"enum\":[\"init\",\"put\",\"remove\",\"status\",\"export\"]},"
    "\"level\":{\"type\":\"string\",\"enum\":[\"table\",\"column\"]},"
    "\"allow_partial\":{\"type\":\"boolean\",\"default\":false},"
    "\"overwrite\":{\"type\":\"boolean\",\"default\":false},"
    "\"limit\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":1000},"
    "\"offset\":{\"type\":\"integer\",\"minimum\":0},"
    "\"decisions\":{\"type\":\"array\",\"minItems\":1,\"maxItems\":1000,\"items\":{"
    "\"type\":\"object\",\"properties\":{"
    "\"decision_id\":{\"type\":\"string\"},\"statement_id\":{\"type\":\"integer\",\"minimum\":1},"
    "\"status\":{\"type\":\"string\",\"enum\":[\"emit\",\"skip\",\"unresolved\"]},"
    "\"level\":{\"type\":\"string\",\"enum\":[\"table\",\"column\"]},"
    "\"context\":{\"type\":\"string\"},\"evidence\":{\"type\":\"string\"},\"reason\":{\"type\":\"string\"},"
    "\"rows\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{"
    "\"source_id\":{\"type\":\"integer\",\"minimum\":1},\"target_id\":{\"type\":\"integer\",\"minimum\":1},"
    "\"source\":{\"type\":\"string\"},\"target\":{\"type\":\"string\"},\"kind\":{\"type\":\"string\"},"
    "\"target_table\":{\"type\":\"string\"},\"target_column\":{\"type\":\"string\"},"
    "\"target_type\":{\"type\":\"string\"},\"workflow\":{\"type\":\"string\"},"
    "\"source_table\":{\"type\":\"string\"},\"source_columns\":{\"type\":\"string\"},"
    "\"expression\":{\"type\":\"string\"},\"file\":{\"type\":\"string\"},"
    "\"line\":{\"type\":\"integer\",\"minimum\":1}},\"additionalProperties\":false}}},"
    "\"required\":[\"decision_id\"],\"additionalProperties\":false}}},"
    "\"required\":[\"project\",\"generation\",\"session\",\"output_dir\",\"action\"],\"additionalProperties\":false}";

static const char *text(yyjson_val *v, const char *key) {
    yyjson_val *value=yyjson_obj_get(v,key);
    const char *s=yyjson_get_str(value);
    return s && strlen(s)==yyjson_get_len(value) ? s : NULL;
}
static bool nonempty(const char *s) { return s && *s; }
static bool session_name(const char *s) {
    if (!nonempty(s) || strlen(s) > 64) return false;
    for (; *s; s++) if (!isalnum((unsigned char)*s) && *s != '-' && *s != '_') return false;
    return true;
}
static char *failure(const char *message, bool *error) {
    *error = true;
    yyjson_mut_doc *d = yyjson_mut_doc_new(NULL);
    yyjson_mut_val *v = yyjson_mut_obj(d);
    yyjson_mut_doc_set_root(d, v);
    yyjson_mut_obj_add_strcpy(d, v, "error", message);
    char *s = yyjson_mut_write(d, 0, NULL);
    yyjson_mut_doc_free(d);
    return s;
}
static bool exec_sql(sqlite3 *db, const char *sql) {
    return sqlite3_exec(db, sql, NULL, NULL, NULL) == SQLITE_OK;
}
static char *scalar(sqlite3 *db, const char *sql, const char *arg) {
    sqlite3_stmt *q = NULL;
    char *result = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &q, NULL) == SQLITE_OK) {
        if (arg) sqlite3_bind_text(q, 1, arg, -1, SQLITE_TRANSIENT);
        if (sqlite3_step(q) == SQLITE_ROW) {
            const char *s = (const char *)sqlite3_column_text(q, 0);
            if (s) result = strdup(s);
        }
    }
    sqlite3_finalize(q);
    return result;
}
static bool bind_step(sqlite3 *db, const char *sql, const char *a, const char *b,
                      const char *c, const char *d) {
    sqlite3_stmt *q = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &q, NULL) != SQLITE_OK) return false;
    const char *values[] = {a,b,c,d};
    for (int i = 0; i < sqlite3_bind_parameter_count(q); i++)
        sqlite3_bind_text(q, i + 1, values[i] ? values[i] : "", -1, SQLITE_TRANSIENT);
    bool ok = sqlite3_step(q) == SQLITE_DONE;
    sqlite3_finalize(q);
    return ok;
}

/* The agent owns lineage decisions. IDs are only a compact way to supply names;
 * do not traverse edges or revalidate statement ownership during collection. */
static char *endpoint(sqlite3 *graph, const char *project,
                      yyjson_val *row, const char *field) {
    const char *literal = text(row, field);
    char key[32];
    snprintf(key, sizeof(key), "%s_id", field);
    yyjson_val *idval = yyjson_obj_get(row, key);
    if (literal && idval) return NULL;
    if (literal) {
        if (!nonempty(literal)) return NULL;
        return strdup(literal);
    }
    if (!yyjson_is_int(idval) || yyjson_get_sint(idval) <= 0) return NULL;
    const char *sql =
        "SELECT n.name FROM nodes n WHERE n.id=?1 AND n.project=?2 "
        "AND n.label='SqlTableRef' AND COALESCE(json_extract(n.properties,'$.ref_kind'),'') != 'cte'";
    sqlite3_stmt *q = NULL;
    char *name = NULL;
    if (sqlite3_prepare_v2(graph, sql, -1, &q, NULL) == SQLITE_OK) {
        sqlite3_bind_int64(q,1,yyjson_get_sint(idval));
        sqlite3_bind_text(q,2,project,-1,SQLITE_TRANSIENT);
        if (sqlite3_step(q) == SQLITE_ROW) {
            const char *s = (const char *)sqlite3_column_text(q,0);
            if (nonempty(s)) name = strdup(s);
        }
    }
    sqlite3_finalize(q);
    return name;
}

/* Escape before deduplication and ordering, i.e. by the rendered TSV contract. */
static char *render(const char **fields, size_t count) {
    size_t size = count + 1;
    for (size_t i=0;i<count;i++) {
        if (!nonempty(fields[i]) || strlen(fields[i]) > 1048576) return NULL;
        size += strlen(fields[i])*2;
    }
    char *out = malloc(size), *p = out;
    if (!out) return NULL;
    for (size_t i=0;i<count;i++) {
        if (i) *p++='\t';
        for (const char *s=fields[i];*s;s++) {
            if (*s=='\t' || *s=='\n' || *s=='\r') {
                *p++='\\'; *p++=*s=='\t'?'t':*s=='\n'?'n':'r';
            } else *p++=*s;
        }
    }
    *p=0;
    return out;
}
static char *row_tsv(sqlite3 *graph, const char *project,
                    const char *level, yyjson_val *row) {
    if (!yyjson_is_obj(row)) return NULL;
    if (strcmp(level,"table")==0) {
        char *source=endpoint(graph,project,row,"source");
        char *target=endpoint(graph,project,row,"target");
        const char *fields[]={source,target,text(row,"kind")};
        char *result=render(fields,3);
        free(source);free(target);
        return result;
    }
    const char *keys[]={"target_table","target_column","target_type","workflow",
        "source_table","source_columns","expression","file","line"};
    const char *fields[9];
    char line[32];
    for (size_t i=0;i<8;i++) fields[i]=text(row,keys[i]);
    yyjson_val *lineval=yyjson_obj_get(row,"line");
    if (!yyjson_is_int(lineval) || yyjson_get_sint(lineval)<1) return NULL;
    snprintf(line,sizeof(line),"%lld",(long long)yyjson_get_sint(lineval));fields[8]=line;
    /* Evidence file paths are repository-relative, never filesystem commands. */
    if (!nonempty(fields[7]) || fields[7][0]=='/' || fields[7][0]=='\\' ||
        strstr(fields[7],"..") || strchr(fields[7],':')) return NULL;
    return render(fields,9);
}

static const char *record_decisions(sqlite3 *db, sqlite3 *graph, const char *project,
                                     yyjson_val *items, bool remove) {
    size_t count=yyjson_arr_size(items);
    if (!yyjson_is_arr(items) || count<1 || count>1000) return "decisions must contain 1..1000 items";
    for (size_t i=0;i<count;i++) {
        yyjson_val *item=yyjson_arr_get(items,i);
        const char *key=text(item,"decision_id");
        if (!nonempty(key) || strlen(key)>512) return "decision_id is required (max 512 bytes)";
        for (size_t j=0;j<i;j++) {
            const char *other=text(yyjson_arr_get(items,j),"decision_id");
            if (other && strcmp(other,key)==0) return "duplicate decision_id in batch";
        }
        if (!bind_step(db,"DELETE FROM decisions WHERE id=?1",key,NULL,NULL,NULL)) return "cannot replace decision";
        if (remove) continue;
        const char *status=text(item,"status"),*level=text(item,"level");
        if (!level) level="table";
        if (!status || (strcmp(status,"emit") && strcmp(status,"skip") && strcmp(status,"unresolved")))
            return "status must be emit, skip or unresolved";
        if (strcmp(level,"table") && strcmp(level,"column")) return "level must be table or column";
        yyjson_val *rows=yyjson_obj_get(item,"rows");
        bool emit=strcmp(status,"emit")==0;
        if ((emit && (!yyjson_is_arr(rows) || !yyjson_arr_size(rows))) ||
            (!emit && rows && (!yyjson_is_arr(rows) || yyjson_arr_size(rows))))
            return "emit requires rows; skip/unresolved must not contain rows";
        if (!nonempty(text(item,"evidence"))) return "evidence is required for every decision";
        if (!emit && !nonempty(text(item,"reason"))) return "skip/unresolved requires reason";
        char *json=yyjson_val_write(item,0,NULL);
        bool ok=bind_step(db,"INSERT INTO decisions(id,status,level,payload) VALUES(?1,?2,?3,?4)",key,status,level,json);
        free(json);
        if (!ok) return "cannot save decision";
        yyjson_val *statement=yyjson_obj_get(item,"statement_id");
        if (statement && (!yyjson_is_int(statement) || yyjson_get_sint(statement)<=0))
            return "statement_id must be a positive integer";
        for (size_t j=0;emit && j<yyjson_arr_size(rows);j++) {
            char *tsv=row_tsv(graph,project,level,yyjson_arr_get(rows,j));
            if (!tsv) return "invalid row: provide nonempty endpoints (templates allowed) or non-CTE SqlTableRef IDs in this project, all contract fields and valid evidence coordinates";
            ok=bind_step(db,"INSERT OR IGNORE INTO rows(decision_id,level,tsv) VALUES(?1,?2,?3)",key,level,tsv,NULL);
            free(tsv);
            if (!ok) return "cannot save row";
        }
    }
    return NULL;
}

static const char *export_tsv(sqlite3 *db, const char *dir, const char *level,
                              bool overwrite, char *destination, size_t destsize) {
    if (strcmp(level,"table") && strcmp(level,"column")) return "level must be table or column";
    if (snprintf(destination,destsize,"%s/%s_lineage.tsv",dir,level)>=(int)destsize) return "output path too long";
    char temp[4096];
    if (snprintf(temp,sizeof(temp),"%s/.lineage-export-XXXXXX",dir)>=(int)sizeof(temp)) return "output path too long";
    int fd=cbm_mkstemp(temp);
    if (fd<0) return "cannot create export temporary file";
    FILE *f=fdopen(fd,"wb");
    if (!f) { close(fd);unlink(temp);return "cannot open export stream"; }
    bool ok=fputs(strcmp(level,"table")==0 ? "source\ttarget\tkind\n" :
        "target_table\ttarget_column\ttarget_type\tworkflow\tsource_table\tsource_columns\texpression\tfile\tline\n",f)>=0;
    sqlite3_stmt *q=NULL;
    int rc=sqlite3_prepare_v2(db,"SELECT DISTINCT tsv FROM rows WHERE level=?1 ORDER BY tsv COLLATE BINARY",-1,&q,NULL);
    if (rc==SQLITE_OK) {
        sqlite3_bind_text(q,1,level,-1,SQLITE_TRANSIENT);
        while ((rc=sqlite3_step(q))==SQLITE_ROW) {
            const char *row=(const char *)sqlite3_column_text(q,0);
            if (fputs(row,f)<0 || fputc('\n',f)==EOF) { ok=false;break; }
        }
        if (rc!=SQLITE_DONE) ok=false;
    } else ok=false;
    sqlite3_finalize(q);
    if (fflush(f)!=0) ok=false;
    if (fclose(f)!=0) ok=false;
    if (ok) ok=(overwrite?cbm_rename_replace(temp,destination):cbm_rename_noreplace(temp,destination))==0;
    if (!ok) { unlink(temp);return "export failed (destination may exist; explicit overwrite=true is required)"; }
    return NULL;
}

char *cbm_lineage_session(sqlite3 *graph, const char *project, const char *args, bool *error) {
    *error=false;
    yyjson_doc *input=yyjson_read(args,strlen(args),0);
    yyjson_val *in=input?yyjson_doc_get_root(input):NULL;
    const char *action=text(in,"action"),*session=text(in,"session"),*dir=text(in,"output_dir");
    const char *err=NULL;
    sqlite3 *db=NULL;
    char *generation=NULL,*stored_project=NULL,*stored_generation=NULL;
    char *revision=NULL,*stored_revision=NULL;
    char canonical[4096],path[4096],destination[4096]={0};
    yyjson_mut_doc *out=NULL;
    bool transaction=false, graph_snapshot=false;
    if (!graph || !nonempty(project) || !session_name(session) || !nonempty(dir) || !action) {
        err="project, action, output_dir and session (1..64 alphanumeric/-/_) are required";goto done;
    }
    bool init=strcmp(action,"init")==0,put=strcmp(action,"put")==0,remove=strcmp(action,"remove")==0;
    bool export=strcmp(action,"export")==0,status=strcmp(action,"status")==0;
    if (!init && !put && !remove && !export && !status) { err="unknown lineage action";goto done; }
    if (!exec_sql(graph,"SAVEPOINT cbm_lineage_evidence")) {err="cannot snapshot graph evidence";goto done;}
    graph_snapshot=true;
    generation=scalar(graph,"SELECT indexed_at FROM projects WHERE name=?1",project);
    if (!nonempty(generation)) { err="project has no index generation";goto done; }
    revision=scalar(graph,"SELECT 'u'||u.v||'g'||g.v FROM store_meta u,store_meta g "
                          "WHERE u.k='db_uid' AND g.k='mutation_gen'",NULL);
    if (!nonempty(revision)) { err="session requires graph revision metadata; reindex a legacy graph before collecting decisions";goto done; }
    const char *expected=text(in,"generation");
    if (!nonempty(expected) || strcmp(expected,generation)) { err="generation is required and must match the current index";goto done; }
    if (init && !cbm_mkdir_p(dir,0700)) { err="cannot create output_dir";goto done; }
    if (!cbm_canonical_path(dir,canonical,sizeof(canonical))) { err="output_dir must exist; call init first";goto done; }
    if (snprintf(path,sizeof(path),"%s/.cbm-lineage-%s.sqlite",canonical,session)>=(int)sizeof(path)) { err="session path too long";goto done; }
    int flags=SQLITE_OPEN_READWRITE | (init?SQLITE_OPEN_CREATE:0);
#ifdef SQLITE_OPEN_NOFOLLOW
    flags|=SQLITE_OPEN_NOFOLLOW;
#endif
    if (sqlite3_open_v2(path,&db,flags,NULL)!=SQLITE_OK) { err="cannot open session database";goto done; }
    sqlite3_busy_timeout(db,10000);
    if (!exec_sql(db,"PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE")) { err="session is busy or inaccessible";goto done; }
    transaction=true;
    if (init) {
        if (!exec_sql(db,
            "CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);"
            "CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,status TEXT NOT NULL,level TEXT NOT NULL,payload TEXT NOT NULL);"
            "CREATE TABLE IF NOT EXISTS rows(decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,"
            "level TEXT NOT NULL,tsv TEXT NOT NULL,PRIMARY KEY(decision_id,level,tsv));"
            "CREATE INDEX IF NOT EXISTS rows_export ON rows(level,tsv);"
            "INSERT OR IGNORE INTO metadata VALUES('version','1');") ||
            !bind_step(db,"INSERT OR IGNORE INTO metadata VALUES('project',?1)",project,NULL,NULL,NULL) ||
            !bind_step(db,"INSERT OR IGNORE INTO metadata VALUES('graph_revision',?1)",revision,NULL,NULL,NULL) ||
            !bind_step(db,"INSERT OR IGNORE INTO metadata VALUES('generation',?1)",generation,NULL,NULL,NULL)) {
            err="cannot initialize session";goto done;
        }
    }
    stored_project=scalar(db,"SELECT value FROM metadata WHERE key='project'",NULL);
    stored_generation=scalar(db,"SELECT value FROM metadata WHERE key='generation'",NULL);
    stored_revision=scalar(db,"SELECT value FROM metadata WHERE key='graph_revision'",NULL);
    char *version=scalar(db,"SELECT value FROM metadata WHERE key='version'",NULL);
    bool version_ok=version && strcmp(version,"1")==0;free(version);
    if (!version_ok || !stored_project || strcmp(stored_project,project) ||
        !stored_generation || strcmp(stored_generation,generation) ||
        !stored_revision || strcmp(stored_revision,revision)) {
        err="session belongs to another project/generation or unsupported schema; use a new session";goto done;
    }
    if (put || remove) {
        err=record_decisions(db,graph,project,yyjson_obj_get(in,"decisions"),remove);
        if (err) goto done;
    }
    if (export) {
        char *unresolved=scalar(db,"SELECT count(*) FROM decisions WHERE status='unresolved'",NULL);
        bool pending=unresolved && strcmp(unresolved,"0")!=0;free(unresolved);
        if (pending && !yyjson_get_bool(yyjson_obj_get(in,"allow_partial"))) {
            err="unresolved decisions remain; resolve them or explicitly export with allow_partial=true";goto done;
        }
        const char *level=text(in,"level");
        err=export_tsv(db,canonical,level?level:"table",yyjson_get_bool(yyjson_obj_get(in,"overwrite")),destination,sizeof(destination));
        if (err) goto done;
    }
    out=yyjson_mut_doc_new(NULL);
    yyjson_mut_val *root=yyjson_mut_obj(out);yyjson_mut_doc_set_root(out,root);
    yyjson_mut_obj_add_strcpy(out,root,"session",session);
    yyjson_mut_obj_add_strcpy(out,root,"generation",generation);
    yyjson_mut_obj_add_strcpy(out,root,"graph_revision",revision);
    yyjson_mut_obj_add_strcpy(out,root,"database",path);
    if (*destination) yyjson_mut_obj_add_strcpy(out,root,"output_file",destination);
    const char *keys[]={"decisions_total","unresolved","table_rows","column_rows"};
    const char *queries[]={"SELECT count(*) FROM decisions","SELECT count(*) FROM decisions WHERE status='unresolved'",
        "SELECT count(DISTINCT tsv) FROM rows WHERE level='table'","SELECT count(DISTINCT tsv) FROM rows WHERE level='column'"};
    for (int i=0;i<4;i++) {
        char *s=scalar(db,queries[i],NULL);
        if (!s) { err="cannot read session counts";goto done; }
        yyjson_mut_obj_add_sint(out,root,keys[i],strtoll(s,NULL,10));free(s);
    }
    if (status) {
        yyjson_val *lv=yyjson_obj_get(in,"limit"),*ov=yyjson_obj_get(in,"offset");
        int64_t limit=lv?yyjson_get_sint(lv):100,offset=ov?yyjson_get_sint(ov):0;
        if ((lv&&!yyjson_is_int(lv)) || (ov&&!yyjson_is_int(ov)) || limit<1 || limit>1000 || offset<0) {
            err="status limit must be 1..1000; offset must be nonnegative";goto done;
        }
        sqlite3_stmt *q=NULL;
        if (sqlite3_prepare_v2(db,"SELECT payload FROM decisions ORDER BY id LIMIT ?1 OFFSET ?2",-1,&q,NULL)!=SQLITE_OK) {err="cannot list decisions";goto done;}
        sqlite3_bind_int64(q,1,limit);sqlite3_bind_int64(q,2,offset);
        yyjson_mut_val *items=yyjson_mut_arr(out);int returned=0,rc;
        while ((rc=sqlite3_step(q))==SQLITE_ROW) {
            const char *s=(const char *)sqlite3_column_text(q,0);
            yyjson_doc *d=yyjson_read(s,strlen(s),0);
            if (d) {
                yyjson_mut_val *item=yyjson_val_mut_copy(out,yyjson_doc_get_root(d));
                yyjson_mut_obj_remove_key(item,"rows");
                yyjson_mut_arr_add_val(items,item);yyjson_doc_free(d);returned++;
            }
        }
        sqlite3_finalize(q);
        if (rc!=SQLITE_DONE) {err="cannot list decisions";goto done;}
        yyjson_mut_obj_add_val(out,root,"decisions",items);
        yyjson_mut_obj_add_sint(out,root,"offset",offset);
        yyjson_mut_obj_add_int(out,root,"returned",returned);
        char *total=scalar(db,"SELECT count(*) FROM decisions",NULL);
        yyjson_mut_obj_add_bool(out,root,"has_more",total && offset+returned<strtoll(total,NULL,10));free(total);
    }
    if (!exec_sql(db,"COMMIT")) {err="cannot commit session";goto done;}
    transaction=false;
done:
    if (transaction) exec_sql(db,"ROLLBACK");
    sqlite3_close(db);
    if (graph_snapshot) exec_sql(graph,"RELEASE cbm_lineage_evidence");
    free(generation);free(stored_project);free(stored_generation);free(revision);free(stored_revision);
    char *reply=err?failure(err,error):yyjson_mut_write(out,0,NULL);
    yyjson_mut_doc_free(out);yyjson_doc_free(input);
    return reply;
}
