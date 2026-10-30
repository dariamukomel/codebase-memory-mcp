/* Compact SQL lineage extraction. CST wrappers are traversed but not retained;
 * only scopes, source occurrences, projections, and complete identifiers are
 * persisted. */
#include "cbm.h"
#include "foundation/constants.h"

#include <string.h>

enum { SQL_ENTITY_LIMIT = 100000 };

static bool sql_push(CBMExtractCtx *ctx, CBMSqlEntity entity, int *index) {
    CBMSqlEntityArray *a = &ctx->result->sql_entities;
    if (a->count >= SQL_ENTITY_LIMIT) {
        ctx->result->walk_truncated = true;
        return false;
    }
    if (a->count >= a->cap) {
        int cap = a->cap ? a->cap * 2 : 32;
        CBMSqlEntity *items = cbm_arena_alloc(ctx->arena, (size_t)cap * sizeof(*items));
        if (!items) {
            return false;
        }
        if (a->items && a->count > 0) {
            memcpy(items, a->items, (size_t)a->count * sizeof(*items));
        }
        a->items = items;
        a->cap = cap;
    }
    if (index) {
        *index = a->count;
    }
    a->items[a->count++] = entity;
    return true;
}

static CBMSqlEntity sql_entity(TSNode node, CBMSqlEntityKind kind, int parent,
                               uint32_t ordinal) {
    TSPoint start = ts_node_start_point(node);
    TSPoint end = ts_node_end_point(node);
    CBMSqlEntity out = {
        .kind = kind,
        .syntax_type = ts_node_type(node),
        .parent = parent,
        .ordinal = ordinal,
        .start_byte = ts_node_start_byte(node),
        .end_byte = ts_node_end_byte(node),
        .start_line = start.row + 1,
        .start_column = start.column,
        .end_line = end.row + 1,
        .end_column = end.column,
        .partial = ts_node_has_error(node),
    };
    return out;
}

static TSNode sql_first_named_non_comment(TSNode node) {
    uint32_t count = ts_node_named_child_count(node);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(node, i);
        const char *type = ts_node_type(child);
        if (strcmp(type, "comment") != 0) {
            return child;
        }
    }
    TSNode none = {0};
    return none;
}

static char *sql_trimmed_text(CBMExtractCtx *ctx, TSNode node) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    if (end > (uint32_t)ctx->source_len) {
        end = (uint32_t)ctx->source_len;
    }
    while (start < end && (ctx->source[start] == ' ' || ctx->source[start] == '\t' ||
                           ctx->source[start] == '\r' || ctx->source[start] == '\n')) {
        start++;
    }
    while (end > start && (ctx->source[end - 1] == ' ' || ctx->source[end - 1] == '\t' ||
                           ctx->source[end - 1] == '\r' || ctx->source[end - 1] == '\n' ||
                           ctx->source[end - 1] == ';')) {
        end--;
    }
    return cbm_arena_strndup(ctx->arena, ctx->source + start, end - start);
}

static const char *sql_cte_name(CBMExtractCtx *ctx, TSNode node) {
    TSNode named = ts_node_child_by_field_name(node, "name", 4);
    if (!ts_node_is_null(named)) return sql_trimmed_text(ctx, named);
    uint32_t count = ts_node_named_child_count(node);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(node, i);
        const char *type = ts_node_type(child);
        if (strcmp(type, "identifier") == 0 || strcmp(type, "object_reference") == 0) {
            return sql_trimmed_text(ctx, child);
        }
    }
    return NULL;
}

static bool sql_text_is_exact_dynamic(TSNode node) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    while (true) {
        if (strcmp(ts_node_type(node), "dynamic_identifier") == 0) return true;
        if (ts_node_named_child_count(node) != 1) return false;
        TSNode child = ts_node_named_child(node, 0);
        if (ts_node_start_byte(child) != start || ts_node_end_byte(child) != end) return false;
        node = child;
    }
}

static CBMSqlRole sql_child_role(CBMSqlRole inherited, const char *slot) {
    if (!slot) return inherited;
    if (strcmp(slot, "target") == 0) return CBM_SQL_ROLE_TARGET;
    if (strcmp(slot, "relation") == 0 || strcmp(slot, "source") == 0) {
        return CBM_SQL_ROLE_SOURCE;
    }
    if (strcmp(slot, "projection") == 0 || strcmp(slot, "assignment") == 0) {
        return CBM_SQL_ROLE_OUTPUT;
    }
    /* `table`, `value`, and arbitrary dialect wrappers inherit the semantic
     * role established above them. A bare `table` field is not enough to say
     * whether an object is read or written. */
    return inherited;
}

/* Decide whether a CST subtree contains anything useful for lineage.  ERROR
 * and dialect-specific wrappers are deliberately not named here: fields carry
 * source/target meaning through them, while the few node types below are the
 * grammar's stable semantic layer. */
static bool sql_has_lineage_signal(TSNode node, const char *incoming_slot,
                                   CBMSqlRole inherited_role) {
    const char *type = ts_node_type(node);
    CBMSqlRole role = sql_child_role(inherited_role, incoming_slot);
    if (strcmp(type, "select") == 0 || strcmp(type, "set_operation") == 0 ||
        strcmp(type, "cte") == 0 || strcmp(type, "subquery") == 0 ||
        strcmp(type, "relation") == 0) {
        return true;
    }
    if (strcmp(type, "object_reference") == 0 &&
        (role == CBM_SQL_ROLE_SOURCE || role == CBM_SQL_ROLE_TARGET)) {
        return true;
    }
    uint32_t count = ts_node_child_count(node);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_child(node, i);
        if (!ts_node_is_named(child)) continue;
        const char *slot = ts_node_field_name_for_child(node, i);
        if (sql_has_lineage_signal(child, slot, role)) return true;
    }
    return false;
}

static const char *sql_projection_name(CBMExtractCtx *ctx, TSNode node, uint32_t ordinal) {
    TSNode alias = ts_node_child_by_field_name(node, "alias", 5);
    if (!ts_node_is_null(alias)) return sql_trimmed_text(ctx, alias);
    return cbm_arena_sprintf(ctx->arena, "projection_%04u", ordinal + 1);
}

static const char *sql_alias(CBMExtractCtx *ctx, TSNode node) {
    TSNode alias = ts_node_child_by_field_name(node, "alias", 5);
    return ts_node_is_null(alias) ? NULL : sql_trimmed_text(ctx, alias);
}

/* Return the query scope introduced through a transparent CST wrapper, or -1.
 * In this grammar SELECT and its FROM are often siblings under statement/insert;
 * carrying the scope across siblings associates sources without naming either
 * wrapper. Semantic boundaries (CTE, relation, subquery, projection) contain
 * such scopes and never leak them to their own siblings. */
static int sql_walk_statement(CBMExtractCtx *ctx, TSNode node, const char *incoming_slot,
                              CBMSqlRole inherited_role, int owner,
                              uint32_t *sibling_ordinals, uint32_t *error_count) {
    const char *type = ts_node_type(node);
    if ((strcmp(type, "ERROR") == 0 || ts_node_is_missing(node)) && error_count) {
        (*error_count)++;
    }
    CBMSqlRole role = sql_child_role(inherited_role, incoming_slot);
    CBMSqlRole descendant_role = role;
    int next_owner = owner;
    int introduced_query = -1;
    bool semantic_boundary = false;
    if (strcmp(type, "cte") == 0) {
        semantic_boundary = true;
        CBMSqlEntity e = sql_entity(node, CBM_SQL_CTE, owner,
                                    sibling_ordinals[CBM_SQL_CTE]++);
        e.name = sql_cte_name(ctx, node);
        e.slot = incoming_slot;
        e.role = role;
        int idx = -1;
        if (sql_push(ctx, e, &idx)) {
            next_owner = idx;
        }
        descendant_role = CBM_SQL_ROLE_NEUTRAL;
    } else if (strcmp(type, "select") == 0 || strcmp(type, "set_operation") == 0) {
        semantic_boundary = true;
        CBMSqlEntity e = sql_entity(node, CBM_SQL_QUERY, owner,
                                    sibling_ordinals[CBM_SQL_QUERY]++);
        e.slot = incoming_slot;
        e.role = role;
        int idx = -1;
        if (sql_push(ctx, e, &idx)) {
            next_owner = idx;
            introduced_query = idx;
        }
        descendant_role = CBM_SQL_ROLE_NEUTRAL;
    } else if (strcmp(type, "relation") == 0) {
        semantic_boundary = true;
        CBMSqlEntity e = sql_entity(node, CBM_SQL_RELATION, owner,
                                    sibling_ordinals[CBM_SQL_RELATION]++);
        e.alias = sql_alias(ctx, node);
        e.name = e.alias ? e.alias : "relation";
        e.slot = incoming_slot;
        e.role = role;
        int idx = -1;
        if (sql_push(ctx, e, &idx)) next_owner = idx;
    } else if (strcmp(type, "term") == 0 && incoming_slot &&
               strcmp(incoming_slot, "projection") == 0) {
        semantic_boundary = true;
        uint32_t ordinal = sibling_ordinals[CBM_SQL_PROJECTION]++;
        CBMSqlEntity e = sql_entity(node, CBM_SQL_PROJECTION, owner, ordinal);
        e.name = sql_projection_name(ctx, node, ordinal);
        e.alias = sql_alias(ctx, node);
        e.slot = incoming_slot;
        e.role = role;
        int idx = -1;
        if (sql_push(ctx, e, &idx)) next_owner = idx;
    } else if (strcmp(type, "object_reference") == 0) {
        semantic_boundary = true;
        if (role == CBM_SQL_ROLE_SOURCE || role == CBM_SQL_ROLE_TARGET) {
            CBMSqlEntity e = sql_entity(node, CBM_SQL_TABLE_REF, owner,
                                        sibling_ordinals[CBM_SQL_TABLE_REF]++);
            e.name = sql_trimmed_text(ctx, node);
            e.slot = incoming_slot;
            e.role = role;
            int idx = -1;
            if (sql_push(ctx, e, &idx)) next_owner = idx;
        }
    } else if (strcmp(type, "subquery") == 0) {
        semantic_boundary = true;
        CBMSqlEntity e = sql_entity(node, CBM_SQL_SUBQUERY, owner,
                                    sibling_ordinals[CBM_SQL_SUBQUERY]++);
        e.slot = incoming_slot;
        e.role = role;
        int idx = -1;
        if (sql_push(ctx, e, &idx)) next_owner = idx;
        descendant_role = CBM_SQL_ROLE_NEUTRAL;
    } else if (strcmp(type, "field") == 0) {
        semantic_boundary = true;
        if (role == CBM_SQL_ROLE_OUTPUT && !sql_text_is_exact_dynamic(node)) {
            CBMSqlEntity e = sql_entity(node, CBM_SQL_COLUMN_REF, owner,
                                        sibling_ordinals[CBM_SQL_COLUMN_REF]++);
            e.name = sql_trimmed_text(ctx, node);
            e.slot = incoming_slot;
            e.role = role;
            int idx = -1;
            if (sql_push(ctx, e, &idx)) next_owner = idx;
        }
    }

    uint32_t child_ordinals[CBM_SQL_KIND_COUNT] = {0};
    uint32_t active_scope_ordinals[CBM_SQL_KIND_COUNT] = {0};
    uint32_t *descendant_ordinals = next_owner == owner ? sibling_ordinals : child_ordinals;
    int sequence_owner = next_owner;
    int transparent_query = -1;
    uint32_t count = ts_node_child_count(node);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_child(node, i);
        if (!ts_node_is_named(child)) continue;
        const char *slot = ts_node_field_name_for_child(node, i);
        uint32_t *ordinals = sequence_owner == next_owner
                                 ? descendant_ordinals
                                 : active_scope_ordinals;
        int child_query = sql_walk_statement(ctx, child, slot, descendant_role,
                                             sequence_owner, ordinals, error_count);
        if (!semantic_boundary && child_query >= 0) {
            sequence_owner = child_query;
            transparent_query = child_query;
        }
    }
    if (introduced_query >= 0) return introduced_query;
    return semantic_boundary ? -1 : transparent_query;
}

static bool sql_is_segment_wrapper(const char *type) {
    return strcmp(type, "statement") == 0 || strcmp(type, "transaction") == 0 ||
           strcmp(type, "block") == 0;
}

static bool sql_extract_segment(CBMExtractCtx *ctx, TSNode node, bool force_partial,
                                uint32_t *statement_ordinal) {
    const char *top_type = ts_node_type(node);
    bool wrapper = strcmp(top_type, "statement") == 0;
    TSNode syntax = wrapper ? sql_first_named_non_comment(node) : node;
    CBMSqlEntity entity = sql_entity(node, CBM_SQL_STATEMENT, -1,
                                     (*statement_ordinal)++);
    entity.syntax_type = ts_node_is_null(syntax) ? top_type : ts_node_type(syntax);
    entity.name = cbm_arena_sprintf(ctx->arena, "statement_%04u", *statement_ordinal);
    entity.partial = force_partial || entity.partial;
    int statement = -1;
    if (!sql_push(ctx, entity, &statement)) return false;

    uint32_t ordinals[CBM_SQL_KIND_COUNT] = {0};
    uint32_t errors = 0;
    (void)sql_walk_statement(ctx, node, NULL, CBM_SQL_ROLE_NEUTRAL, statement,
                             ordinals, &errors);
    if (force_partial && errors == 0) errors = 1;
    ctx->result->sql_entities.items[statement].error_count = errors;
    ctx->result->sql_entities.items[statement].partial |= errors > 0;
    return true;
}

/* Recovery sometimes nests intact statements below an ERROR or another
 * unknown program child. Promote the maximal intact wrappers, so unrelated
 * LET/PRINT/IF text is not retained as a fake SQL segment. */
static int sql_extract_recovered(CBMExtractCtx *ctx, TSNode node,
                                 uint32_t *statement_ordinal) {
    const char *type = ts_node_type(node);
    if (sql_is_segment_wrapper(type) &&
        sql_has_lineage_signal(node, NULL, CBM_SQL_ROLE_NEUTRAL)) {
        return sql_extract_segment(ctx, node, true, statement_ordinal) ? 1 : -1;
    }
    int extracted = 0;
    uint32_t count = ts_node_named_child_count(node);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(node, i);
        if (strcmp(ts_node_type(child), "comment") == 0) continue;
        int rc = sql_extract_recovered(ctx, child, statement_ordinal);
        if (rc < 0) return -1;
        extracted += rc;
    }
    return extracted;
}

void cbm_extract_sql_structure(CBMExtractCtx *ctx) {
    if (!ctx || ctx->language != CBM_LANG_SQL || !ctx->result) {
        return;
    }
    uint32_t statement_ordinal = 0;
    uint32_t count = ts_node_named_child_count(ctx->root);
    for (uint32_t i = 0; i < count; i++) {
        TSNode node = ts_node_named_child(ctx->root, i);
        const char *top_type = ts_node_type(node);
        if (strcmp(top_type, "comment") == 0) continue;
        if (sql_is_segment_wrapper(top_type)) {
            if (sql_has_lineage_signal(node, NULL, CBM_SQL_ROLE_NEUTRAL) &&
                !sql_extract_segment(ctx, node, false, &statement_ordinal)) return;
            continue;
        }
        int recovered = sql_extract_recovered(ctx, node, &statement_ordinal);
        if (recovered < 0) return;
        if (recovered == 0 &&
            sql_has_lineage_signal(node, NULL, CBM_SQL_ROLE_NEUTRAL) &&
            !sql_extract_segment(ctx, node, true, &statement_ordinal)) return;
    }
}
