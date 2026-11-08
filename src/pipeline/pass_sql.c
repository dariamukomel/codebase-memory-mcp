/* Compact SQL lineage -> graph projection. It remains separate from the
 * generic definition registry and does not attempt catalog resolution. */
#include "pipeline/pipeline_internal.h"

#include "foundation/str_util.h"
#include "foundation/sha256.h"
#include "graph_buffer/graph_buffer.h"
#include "yyjson/yyjson.h"

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
    case CBM_SQL_CLAUSE: return "SqlClause";
    case CBM_SQL_ASSIGNMENT: return "SqlAssignment";
    case CBM_SQL_EXTERNAL_SOURCE: return "SqlExternalSource";
    case CBM_SQL_TABLE_REF: return "SqlTableRef";
    case CBM_SQL_CTE_REF: return "SqlCteRef";
    case CBM_SQL_COLUMN_REF: return "SqlColumnRef";
    case CBM_SQL_VARIABLE_REF: return "SqlVariableRef";
    case CBM_SQL_UNPARSED_REGION: return "SqlUnparsedRegion";
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
    case CBM_SQL_RELATION: return "HAS_QUERY_INPUT";
    case CBM_SQL_PROJECTION: return "CONTAINS_PROJECTION";
    case CBM_SQL_CLAUSE: return "HAS_CLAUSE";
    case CBM_SQL_ASSIGNMENT: return "HAS_ASSIGNMENT";
    case CBM_SQL_EXTERNAL_SOURCE: return "HAS_EXTERNAL_SOURCE";
    case CBM_SQL_TABLE_REF: return "REFERENCES_TABLE";
    case CBM_SQL_CTE_REF: return "REFERENCES_CTE";
    case CBM_SQL_COLUMN_REF: return "READS_COLUMN";
    case CBM_SQL_VARIABLE_REF: return "HAS_DYNAMIC_PART";
    case CBM_SQL_UNPARSED_REGION: return "CONTAINS_UNPARSED_REGION";
    case CBM_SQL_KIND_COUNT: break;
    }
    return "CONTAINS_SQL_ENTITY";
}

static char *sql_qn(const cbm_pipeline_ctx_t *ctx, const char *rel, const CBMSqlEntity *e,
                    const CBMSqlEntity *parent) {
    char identity[192];
    snprintf(identity, sizeof(identity), "__sql__%s_%u_%u_%u_%u_%u_%u", sql_label(e->kind),
             e->statement_ordinal, parent ? parent->start_byte : 0,
             parent ? parent->end_byte : 0, e->start_byte, e->end_byte, e->ordinal);
    size_t size = strlen(rel) + strlen(identity) + 2;
    char *key = malloc(size);
    if (!key) return NULL;
    snprintf(key, size, "%s:%s", rel, identity);
    char digest[CBM_SHA256_HEX_LEN + 1];
    cbm_sha256_hex(key, strlen(key), digest);
    free(key);
    size = strlen(ctx->project_name) + sizeof(digest) + 12;
    char *qn = malloc(size);
    if (qn) snprintf(qn, size, "%s.__sql__.%s", ctx->project_name, digest);
    return qn;
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
    if (e->kind == CBM_SQL_CTE_REF) return "REFERENCES_CTE";
    if (e->kind == CBM_SQL_TABLE_REF) {
        if (e->role == CBM_SQL_ROLE_TARGET) return "HAS_TARGET_REF";
        if (e->role == CBM_SQL_ROLE_SOURCE && parent_kind != CBM_SQL_RELATION) {
            return e->clause_kind && strcmp(e->clause_kind, "like") == 0
                       ? "HAS_SCHEMA_TEMPLATE"
                       : "HAS_SOURCE_REF";
        }
    }
    if (e->kind == CBM_SQL_COLUMN_REF && e->role == CBM_SQL_ROLE_TARGET) {
        return "HAS_TARGET_COLUMN";
    }
    if (e->kind == CBM_SQL_COLUMN_REF && e->role == CBM_SQL_ROLE_NEUTRAL) {
        return "REFERENCES_COLUMN";
    }
    if (e->kind == CBM_SQL_RELATION) {
        return e->clause_kind && strcmp(e->clause_kind, "like") == 0
                   ? "HAS_SCHEMA_TEMPLATE"
                   : "HAS_QUERY_INPUT";
    }
    return sql_edge(e->kind);
}

static char *sql_props(const CBMSqlEntity *e, const CBMSqlEntity *statement,
                       int ctes, int tables, int errors) {
    yyjson_mut_doc *doc = yyjson_mut_doc_new(NULL);
    if (!doc) return NULL;
    yyjson_mut_val *obj = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, obj);
#define SQL_STRING(key, value) do { const char *v = (value); \
    if (v && v[0]) yyjson_mut_obj_add_str(doc, obj, key, v); } while (0)
#define SQL_UINT(key, value) yyjson_mut_obj_add_uint(doc, obj, key, (uint64_t)(value))
    SQL_STRING("syntax_type", e->syntax_type);
    SQL_STRING("detail", e->detail);
    SQL_STRING("slot", e->slot);
    SQL_STRING("alias", e->alias);
    SQL_STRING("clause_kind", e->clause_kind);
    SQL_STRING("syntax_path", e->syntax_path);
    SQL_STRING("ref_kind", e->ref_kind);
    SQL_STRING("expression_kind", e->expression_kind);
    SQL_STRING("modifier", e->modifier);
    SQL_STRING("role", sql_role_name(e->role));
    SQL_UINT("ordinal", e->ordinal);
    if (statement && statement->kind == CBM_SQL_STATEMENT)
        SQL_UINT("statement_ordinal", e->statement_ordinal);
    SQL_UINT("start_byte", e->start_byte); SQL_UINT("end_byte", e->end_byte);
    SQL_UINT("start_line", e->start_line); SQL_UINT("end_line", e->end_line);
    SQL_UINT("start_column", e->start_column); SQL_UINT("end_column", e->end_column);
    SQL_STRING("parse_status", e->partial ? "partial" : "complete");
    /* Inherited operation/dialect and aggregate counters belong on the
     * statement only. Child nodes retain ownership, not repeated metadata. */
    if (e->kind == CBM_SQL_STATEMENT) {
        SQL_STRING("statement_type", e->syntax_type);
        SQL_STRING("operation", e->operation);
        SQL_STRING("write_mode", e->write_mode);
        SQL_STRING("source_form", e->source_form);
        SQL_STRING("dialect_source", e->dialect_source);
        SQL_STRING("dialect_evidence", e->dialect_evidence);
        bool declared = e->dialect_source && (!strcmp(e->dialect_source, "config") ||
                                               !strcmp(e->dialect_source, "environment"));
        SQL_STRING("dialect_confidence", declared ? "declared" : "heuristic");
        SQL_UINT("cte_count", ctes); SQL_UINT("table_ref_count", tables);
        SQL_UINT("ast_reference_count", e->ast_reference_count);
        SQL_UINT("missing_reference_count", e->missing_reference_count);
        SQL_STRING("extraction_status", e->missing_reference_count ? "partial" : "complete");
        SQL_UINT("error_count", errors);
        yyjson_mut_obj_add_bool(doc, obj, "has_error", errors != 0);
    } else if (e->error_count) SQL_UINT("error_count", e->error_count);
#undef SQL_STRING
#undef SQL_UINT
    char *out = yyjson_mut_write(doc, 0, NULL);
    yyjson_mut_doc_free(doc);
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
    if (!ctx || !result || !rel_path ||
        (result->sql_entities.count <= 0 && !result->parse_incomplete &&
         !result->walk_truncated)) return 0;
    const CBMSqlEntityArray *a = &result->sql_entities;
    int64_t *ids = a->count > 0 ? calloc((size_t)a->count, sizeof(*ids)) : NULL;
    int *statement_of = a->count > 0 ? malloc((size_t)a->count * sizeof(*statement_of)) : NULL;
    int *cte_counts = a->count > 0 ? calloc((size_t)a->count, sizeof(*cte_counts)) : NULL;
    int *table_counts = a->count > 0 ? calloc((size_t)a->count, sizeof(*table_counts)) : NULL;
    if (a->count > 0 && (!ids || !statement_of || !cte_counts || !table_counts)) {
        free(ids); free(statement_of); free(cte_counts); free(table_counts);
        return -1;
    }
    for (int i = 0; i < a->count; i++) {
        statement_of[i] = sql_statement_ancestor(a, i);
        int statement = statement_of[i];
        if (statement >= 0) {
            cte_counts[statement] += a->items[i].kind == CBM_SQL_CTE;
            table_counts[statement] += a->items[i].kind == CBM_SQL_TABLE_REF;
        }
    }
    const cbm_gbuf_node_t *file = cbm_pipeline_file_node(ctx->gbuf, ctx->project_name, rel_path);
    int made = 0;
    char *summary_qn = cbm_pipeline_fqn_compute(ctx->project_name, rel_path,
                                                "__sql_file_summary__");
    char *ranges = sql_escape_alloc(result->error_ranges);
    int statement_count = 0, unparsed_count = 0;
    for (int i = 0; i < a->count; i++) {
        statement_count += a->items[i].kind == CBM_SQL_STATEMENT;
        unparsed_count += a->items[i].kind == CBM_SQL_UNPARSED_REGION;
    }
    const char *summary_format =
        "{\"parse_status\":\"%s\",\"parse_unusable\":%s,"
        "\"error_ranges\":\"%s\",\"error_region_count\":%d,"
        "\"walk_truncated\":%s,\"entity_count\":%d,"
        "\"statement_count\":%d,\"unparsed_region_count\":%d}";
    int summary_needed = snprintf(NULL, 0, summary_format,
        result->parse_incomplete ? "partial" : "complete",
        result->parse_unusable ? "true" : "false", ranges ? ranges : "",
        result->error_region_count, result->walk_truncated ? "true" : "false",
        a->count, statement_count, unparsed_count);
    char *summary_props = summary_needed >= 0 ? malloc((size_t)summary_needed + 1) : NULL;
    if (summary_props) snprintf(summary_props, (size_t)summary_needed + 1, summary_format,
        result->parse_incomplete ? "partial" : "complete",
        result->parse_unusable ? "true" : "false", ranges ? ranges : "",
        result->error_region_count, result->walk_truncated ? "true" : "false",
        a->count, statement_count, unparsed_count);
    int64_t summary_id = summary_qn && summary_props
        ? cbm_gbuf_upsert_node(ctx->gbuf, "SqlFileSummary", rel_path, summary_qn,
                               rel_path, 1, 1, summary_props)
        : 0;
    if (file && summary_id > 0)
        cbm_gbuf_insert_edge(ctx->gbuf, file->id, summary_id, "HAS_SQL_SUMMARY", "{}");
    free(summary_qn); free(ranges); free(summary_props);
    for (int i = 0; i < a->count; i++) {
        const CBMSqlEntity *e = &a->items[i];
        int ctes = e->kind == CBM_SQL_STATEMENT ? cte_counts[i] : 0;
        int tables = e->kind == CBM_SQL_STATEMENT ? table_counts[i] : 0;
        int statement_index = statement_of[i];
        int errors = statement_index >= 0
                         ? (int)a->items[statement_index].error_count
                         : (int)e->error_count;
        const CBMSqlEntity *statement = statement_index >= 0
                                            ? &a->items[statement_index]
                                            : e;
        const CBMSqlEntity *parent_entity = e->parent >= 0 && e->parent < i
                                                ? &a->items[e->parent] : NULL;
        char *qn = sql_qn(ctx, rel_path, e, parent_entity);
        char *props = sql_props(e, statement, ctes, tables, errors);
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
        if ((ref->kind != CBM_SQL_TABLE_REF && ref->kind != CBM_SQL_CTE_REF) ||
            !ref->name || ids[i] <= 0) continue;
        int target = ref->resolved_entity;
        if (target >= 0 && target < a->count && ids[target] > 0 &&
            a->items[target].kind == CBM_SQL_CTE) {
            cbm_gbuf_insert_edge(ctx->gbuf, ids[i], ids[target], "RESOLVES_TO_CTE", "{}");
        }
    }
    free(ids); free(statement_of); free(cte_counts); free(table_counts);
    return made;
}
