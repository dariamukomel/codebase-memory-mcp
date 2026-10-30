/* Compact SQL lineage -> graph projection. It remains separate from the
 * generic definition registry and does not attempt catalog resolution. */
#include "pipeline/pipeline_internal.h"

#include "foundation/str_util.h"
#include "graph_buffer/graph_buffer.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *sql_label(CBMSqlEntityKind kind) {
    switch (kind) {
    case CBM_SQL_STATEMENT: return "SqlStatement";
    case CBM_SQL_CTE: return "SqlCte";
    case CBM_SQL_SUBQUERY: return "SqlSubquery";
    case CBM_SQL_QUERY: return "SqlQuery";
    case CBM_SQL_RELATION: return "SqlRelation";
    case CBM_SQL_PROJECTION: return "SqlProjection";
    case CBM_SQL_TABLE_REF: return "SqlTableRef";
    case CBM_SQL_COLUMN_REF: return "SqlColumnRef";
    case CBM_SQL_KIND_COUNT: break;
    }
    return "SqlEntity";
}

static const char *sql_edge(CBMSqlEntityKind kind) {
    switch (kind) {
    case CBM_SQL_STATEMENT: return "CONTAINS_STATEMENT";
    case CBM_SQL_CTE: return "CONTAINS_CTE";
    case CBM_SQL_SUBQUERY: return "CONTAINS_SUBQUERY";
    case CBM_SQL_QUERY: return "CONTAINS_QUERY";
    case CBM_SQL_RELATION: return "READS_FROM";
    case CBM_SQL_PROJECTION: return "CONTAINS_PROJECTION";
    case CBM_SQL_TABLE_REF: return "REFERENCES_TABLE";
    case CBM_SQL_COLUMN_REF: return "READS_COLUMN";
    case CBM_SQL_KIND_COUNT: break;
    }
    return "CONTAINS_SQL_ENTITY";
}

static char *sql_qn(const cbm_pipeline_ctx_t *ctx, const char *rel, const CBMSqlEntity *e,
                    int traversal_index) {
    char identity[192];
    snprintf(identity, sizeof(identity), "__sql__%s_%u_%u_%u_%d", sql_label(e->kind),
             e->start_byte, e->end_byte, e->ordinal, traversal_index);
    return cbm_pipeline_fqn_compute(ctx->project_name, rel, identity);
}

static char *sql_escape_alloc(const char *value) {
    const char *src = value ? value : "";
    size_t len = strlen(src);
    if (len > (SIZE_MAX - 1) / 6) return NULL;
    size_t cap = len * 6 + 1;
    char *out = malloc(cap);
    if (out) cbm_json_escape(out, cap, src);
    return out;
}

static const char *sql_role_name(CBMSqlRole role) {
    switch (role) {
    case CBM_SQL_ROLE_SOURCE: return "source";
    case CBM_SQL_ROLE_TARGET: return "target";
    case CBM_SQL_ROLE_OUTPUT: return "output";
    case CBM_SQL_ROLE_NEUTRAL: return "neutral";
    }
    return "neutral";
}

static const char *sql_entity_edge(const CBMSqlEntity *e, CBMSqlEntityKind parent_kind) {
    if (e->kind == CBM_SQL_TABLE_REF) {
        if (e->role == CBM_SQL_ROLE_TARGET) return "WRITES_TO";
        if (e->role == CBM_SQL_ROLE_SOURCE && parent_kind != CBM_SQL_RELATION) {
            return "READS_FROM";
        }
    }
    return sql_edge(e->kind);
}

static char *sql_props(const CBMSqlEntity *e, const char *statement_type, int ctes, int tables,
                       int errors) {
    char *syntax = sql_escape_alloc(e->syntax_type);
    char *detail = sql_escape_alloc(e->detail);
    char *slot = sql_escape_alloc(e->slot);
    char *alias = sql_escape_alloc(e->alias);
    char *statement = sql_escape_alloc(statement_type);
    if (!syntax || !detail || !slot || !alias || !statement) {
        free(syntax); free(detail); free(slot); free(alias); free(statement);
        return NULL;
    }
    const char *status = e->partial ? "partial" : "complete";
    int needed = snprintf(NULL, 0,
        "{\"kind\":\"%s\",\"syntax_type\":\"%s\",\"detail\":\"%s\",\"slot\":\"%s\","
        "\"alias\":\"%s\","
        "\"role\":\"%s\","
        "\"ordinal\":%u,\"start_byte\":%u,\"end_byte\":%u,"
        "\"start_line\":%u,\"start_column\":%u,\"end_line\":%u,"
        "\"end_column\":%u,\"parse_status\":\"%s\",\"statement_type\":\"%s\","
        "\"cte_count\":%d,\"table_ref_count\":%d,\"error_count\":%d,\"has_error\":%s}",
        sql_label(e->kind), syntax, detail, slot, alias, sql_role_name(e->role), e->ordinal,
        e->start_byte, e->end_byte,
        e->start_line, e->start_column, e->end_line, e->end_column, status, statement,
        ctes, tables, errors, errors ? "true" : "false");
    if (needed < 0) {
        free(syntax); free(detail); free(slot); free(alias); free(statement);
        return NULL;
    }
    char *out = malloc((size_t)needed + 1);
    if (!out) {
        free(syntax); free(detail); free(slot); free(alias); free(statement);
        return NULL;
    }
    snprintf(out, (size_t)needed + 1,
        "{\"kind\":\"%s\",\"syntax_type\":\"%s\",\"detail\":\"%s\",\"slot\":\"%s\","
        "\"alias\":\"%s\","
        "\"role\":\"%s\","
        "\"ordinal\":%u,\"start_byte\":%u,\"end_byte\":%u,"
        "\"start_line\":%u,\"start_column\":%u,\"end_line\":%u,"
        "\"end_column\":%u,\"parse_status\":\"%s\",\"statement_type\":\"%s\","
        "\"cte_count\":%d,\"table_ref_count\":%d,\"error_count\":%d,\"has_error\":%s}",
        sql_label(e->kind), syntax, detail, slot, alias, sql_role_name(e->role), e->ordinal,
        e->start_byte, e->end_byte,
        e->start_line, e->start_column, e->end_line, e->end_column, status, statement,
        ctes, tables, errors, errors ? "true" : "false");
    free(syntax); free(detail); free(slot); free(alias); free(statement);
    return out;
}

static int sql_statement_ancestor(const CBMSqlEntityArray *a, int index) {
    while (index >= 0 && index < a->count) {
        if (a->items[index].kind == CBM_SQL_STATEMENT) return index;
        index = a->items[index].parent;
    }
    return -1;
}

int cbm_pipeline_sql_structure(cbm_pipeline_ctx_t *ctx, const CBMFileResult *result,
                               const char *rel_path) {
    if (!ctx || !result || !rel_path || result->sql_entities.count <= 0) return 0;
    const CBMSqlEntityArray *a = &result->sql_entities;
    int64_t *ids = calloc((size_t)a->count, sizeof(*ids));
    if (!ids) return -1;
    const cbm_gbuf_node_t *file = cbm_pipeline_file_node(ctx->gbuf, ctx->project_name, rel_path);
    int made = 0;
    for (int i = 0; i < a->count; i++) {
        const CBMSqlEntity *e = &a->items[i];
        int ctes = 0, tables = 0;
        if (e->kind == CBM_SQL_STATEMENT) {
            for (int j = i + 1; j < a->count; j++) {
                if (sql_statement_ancestor(a, j) != i) continue;
                ctes += a->items[j].kind == CBM_SQL_CTE;
                tables += a->items[j].kind == CBM_SQL_TABLE_REF;
            }
        }
        int statement_index = sql_statement_ancestor(a, i);
        int errors = statement_index >= 0
                         ? (int)a->items[statement_index].error_count
                         : (int)e->error_count;
        const char *statement_type = statement_index >= 0
                                         ? a->items[statement_index].syntax_type
                                         : e->syntax_type;
        char *qn = sql_qn(ctx, rel_path, e, i);
        char *props = sql_props(e, statement_type, ctes, tables, errors);
        const char *name = e->name && e->name[0] ? e->name : e->syntax_type;
        if (qn && props) {
            ids[i] = cbm_gbuf_upsert_node(ctx->gbuf, sql_label(e->kind), name ? name : "sql",
                                          qn, rel_path, (int)e->start_line, (int)e->end_line,
                                          props);
        }
        free(props);
        free(qn);
        if (ids[i] <= 0) continue;
        int64_t parent = e->parent >= 0 && e->parent < i ? ids[e->parent] : (file ? file->id : 0);
        CBMSqlEntityKind parent_kind = e->parent >= 0 && e->parent < i
                                          ? a->items[e->parent].kind
                                          : CBM_SQL_STATEMENT;
        if (parent > 0) {
            cbm_gbuf_insert_edge(ctx->gbuf, parent, ids[i],
                                 sql_entity_edge(e, parent_kind), "{}");
        }
        made++;
    }
    /* A source spelling that exactly matches a CTE in the same statement also
     * resolves to the declared scope; the ordinary source edges remain intact. */
    for (int i = 0; i < a->count; i++) {
        const CBMSqlEntity *ref = &a->items[i];
        if (ref->kind != CBM_SQL_TABLE_REF || !ref->name || ids[i] <= 0) continue;
        int statement = sql_statement_ancestor(a, i);
        for (int j = 0; j < a->count; j++) {
            const CBMSqlEntity *cte = &a->items[j];
            if (cte->kind == CBM_SQL_CTE && cte->name && ids[j] > 0 &&
                sql_statement_ancestor(a, j) == statement && strcmp(ref->name, cte->name) == 0) {
                cbm_gbuf_insert_edge(ctx->gbuf, ids[i], ids[j], "REFERENCES_CTE", "{}");
                break;
            }
        }
    }
    free(ids);
    return made;
}
