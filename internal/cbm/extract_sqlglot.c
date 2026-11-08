/* SQLGlot-backed SQL extraction.
 *
 * The production build embeds CPython and an exact SQLGlot release. This file
 * deliberately talks to SQLGlot through CPython's C API: there is no JSON,
 * subprocess or Python adapter module between the AST and CBMSqlEntityArray.
 */
#if defined(CBM_SQLGLOT_EMBEDDED) && CBM_SQLGLOT_EMBEDDED
/* CPython requires Python.h before every libc header. Its generated pyconfig.h
 * selects the feature-test levels that glibc must see on first inclusion. */
#include <Python.h>
#endif

#include "cbm.h"
#include "sql_dialect.h"
#include "sqlglot_runtime.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(CBM_SQLGLOT_EMBEDDED) && CBM_SQLGLOT_EMBEDDED
enum { SQLGLOT_ENTITY_LIMIT = 100000, SQLGLOT_RECOVERY_ATTEMPTS = 128 };

typedef struct {
    PyObject **items;
    uint32_t count;
    uint32_t cap;
} SqlVisited;

typedef struct {
    CBMExtractCtx *ctx;
    const CBMSqlglotApi *api;
    const char *original;
    const char *masked;
    uint32_t base;
    uint32_t len;
    const char *dialect;
    int statement_index;
    uint32_t statement_ordinal;
    bool partial;
    uint32_t error_count;
    SqlVisited *visited;
    uint32_t *line_starts;
    uint32_t line_count;
} SqlWalk;

typedef struct {
    uint32_t starts[3];
    uint32_t ends[3];
    uint32_t count;
} SqlRecoveryGaps;

static bool sql_push(CBMExtractCtx *ctx, CBMSqlEntity e, int *index) {
    CBMSqlEntityArray *a = &ctx->result->sql_entities;
    if (a->count >= SQLGLOT_ENTITY_LIMIT) {
        ctx->result->walk_truncated = true;
        return false;
    }
    if (a->count >= a->cap) {
        int cap = a->cap ? a->cap * 2 : 32;
        CBMSqlEntity *items = cbm_arena_alloc(ctx->arena, (size_t)cap * sizeof(*items));
        if (!items) return false;
        if (a->items) memcpy(items, a->items, (size_t)a->count * sizeof(*items));
        a->items = items;
        a->cap = cap;
    }
    if (index) *index = a->count;
    a->items[a->count++] = e;
    return true;
}

static void sql_line_column(const char *source, uint32_t offset, uint32_t *line,
                            uint32_t *column) {
    uint32_t row = 1, col = 0;
    for (uint32_t i = 0; i < offset; i++) {
        if (source[i] == '\n') { row++; col = 0; }
        else col++;
    }
    *line = row;
    *column = col;
}

static void sql_walk_line_column(const SqlWalk *w, uint32_t offset, uint32_t *line,
                                 uint32_t *column) {
    if (!w->line_starts || !w->line_count) {
        sql_line_column(w->ctx->source, offset, line, column);
        return;
    }
    uint32_t lo = 0, hi = w->line_count;
    while (lo + 1 < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        if (w->line_starts[mid] <= offset) lo = mid;
        else hi = mid;
    }
    *line = lo + 1;
    *column = offset - w->line_starts[lo];
}

static CBMSqlEntity sql_entity(SqlWalk *w, CBMSqlEntityKind kind, int parent,
                               uint32_t ordinal, uint32_t start, uint32_t end) {
    if (start > w->len) start = 0;
    if (end > w->len || end < start) end = w->len;
    CBMSqlEntity e = {0};
    e.kind = kind;
    e.parent = parent;
    e.resolved_entity = -1;
    e.statement_ordinal = w->statement_ordinal;
    e.ordinal = ordinal;
    e.start_byte = w->base + start;
    e.end_byte = w->base + end;
    e.partial = w->partial;
    e.error_count = w->error_count;
    sql_walk_line_column(w, e.start_byte, &e.start_line, &e.start_column);
    sql_walk_line_column(w, e.end_byte, &e.end_line, &e.end_column);
    return e;
}

static bool py_is(PyObject *obj, PyObject *type) {
    return obj && type && PyObject_IsInstance(obj, type) == 1;
}

static bool py_sequence(PyObject *obj) {
    /* SQLGlot Expr implements __getitem__, so PySequence_Check also accepts
     * individual AST nodes. Only argument collections may be iterated here. */
    return obj && (PyList_Check(obj) || PyTuple_Check(obj));
}

static bool sql_ascii_ieq(const char *a, const char *b) {
    if (!a || !b) return false;
    while (*a && *b) {
        if (toupper((unsigned char)*a++) != toupper((unsigned char)*b++)) return false;
    }
    return *a == '\0' && *b == '\0';
}

static PyObject *py_attr(PyObject *obj, const char *name) {
    if (!obj) return NULL;
    PyObject *out = PyObject_GetAttrString(obj, name);
    if (!out) PyErr_Clear();
    return out;
}

static PyObject *py_arg(PyObject *obj, const char *name) {
    PyObject *args = py_attr(obj, "args");
    if (!args || !PyDict_Check(args)) { Py_XDECREF(args); return NULL; }
    PyObject *value = PyDict_GetItemString(args, name);
    Py_XINCREF(value);
    Py_DECREF(args);
    return value;
}

static const char *py_string_arena(CBMArena *arena, PyObject *value) {
    if (!value || value == Py_None) return NULL;
    PyObject *text = PyObject_Str(value);
    if (!text) { PyErr_Clear(); return NULL; }
    Py_ssize_t n = 0;
    const char *s = PyUnicode_AsUTF8AndSize(text, &n);
    const char *out = s ? cbm_arena_strndup(arena, s, (size_t)n) : NULL;
    if (!s) PyErr_Clear();
    Py_DECREF(text);
    return out;
}

static const char *py_attr_string(CBMArena *arena, PyObject *obj, const char *name) {
    PyObject *value = py_attr(obj, name);
    const char *out = py_string_arena(arena, value);
    Py_XDECREF(value);
    return out;
}

static bool py_meta_span(PyObject *node, uint32_t *start, uint32_t *end) {
    PyObject *meta = py_attr(node, "meta");
    if (!meta || !PyDict_Check(meta)) { Py_XDECREF(meta); return false; }
    PyObject *s = PyDict_GetItemString(meta, "start");
    PyObject *e = PyDict_GetItemString(meta, "end");
    bool ok = s && e && PyLong_Check(s) && PyLong_Check(e);
    if (ok) {
        unsigned long a = PyLong_AsUnsignedLong(s);
        unsigned long b = PyLong_AsUnsignedLong(e);
        ok = !PyErr_Occurred() && a <= UINT32_MAX && b < UINT32_MAX;
        if (ok) { *start = (uint32_t)a; *end = (uint32_t)b + 1; }
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_DECREF(meta);
    return ok;
}

/* Expressions normally have no own token span. Derive the half-open range
 * from descendant identifiers, whose SQLGlot metadata retains source offsets. */
static bool py_expr_span(PyObject *node, uint32_t *start, uint32_t *end) {
    if (py_meta_span(node, start, end)) return true;
    PyObject *walk = PyObject_CallMethod(node, "walk", NULL);
    PyObject *it = walk ? PyObject_GetIter(walk) : NULL;
    PyObject *item;
    bool found = false;
    uint32_t lo = UINT32_MAX, hi = 0;
    while (it && (item = PyIter_Next(it))) {
        uint32_t a, b;
        if (py_meta_span(item, &a, &b)) {
            if (a < lo) lo = a;
            if (b > hi) hi = b;
            found = true;
        }
        Py_DECREF(item);
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_XDECREF(it);
    Py_XDECREF(walk);
    if (found) { *start = lo; *end = hi; }
    return found;
}

/* SQLGlot metadata is indexed in Unicode code points; CBM stores byte offsets.
 * Convert against the exact masked UTF-8 slice handed to SQLGlot. */
static uint32_t sql_char_to_byte(const SqlWalk *w, uint32_t character) {
    uint32_t byte = 0, current = 0;
    while (byte < w->len && current < character) {
        unsigned char c = (unsigned char)w->masked[byte++];
        if (c < 0x80) {
            current++;
        } else {
            while (byte < w->len &&
                   ((unsigned char)w->masked[byte] & 0xc0u) == 0x80u) byte++;
            current++;
        }
    }
    return byte;
}

static bool sql_expr_span(SqlWalk *w, PyObject *node, uint32_t *start, uint32_t *end) {
    uint32_t char_start, char_end;
    if (!py_expr_span(node, &char_start, &char_end)) return false;
    *start = sql_char_to_byte(w, char_start);
    *end = sql_char_to_byte(w, char_end);
    return true;
}

static const char *original_identifier(SqlWalk *w, PyObject *identifier) {
    uint32_t start = 0, end = 0;
    if (identifier && py_meta_span(identifier, &start, &end)) {
        start = sql_char_to_byte(w, start);
        end = sql_char_to_byte(w, end);
    }
    if (start < end && end <= w->len) {
        return cbm_arena_strndup(w->ctx->arena, w->original + start, end - start);
    }
    return py_attr_string(w->ctx->arena, identifier, "name");
}

static const char *qualified_name(SqlWalk *w, PyObject *node) {
    static const char *parts[] = {"catalog", "db", "table", "this"};
    const char *values[4] = {0};
    int count = 0;
    for (int i = 0; i < 4; i++) {
        PyObject *part = py_arg(node, parts[i]);
        if (part && part != Py_None) {
            const char *value = py_is(part, w->api->identifier_type)
                                    ? original_identifier(w, part)
                                    : py_attr_string(w->ctx->arena, part, "name");
            if (value && value[0]) values[count++] = value;
        }
        Py_XDECREF(part);
    }
    if (!count) return py_attr_string(w->ctx->arena, node, "name");
    if (count == 1) return values[0];
    size_t size = 1;
    for (int i = 0; i < count; i++) size += strlen(values[i]) + (i != 0);
    char *out = cbm_arena_alloc(w->ctx->arena, size);
    if (!out) return NULL;
    out[0] = '\0';
    for (int i = 0; i < count; i++) {
        if (i) strcat(out, ".");
        strcat(out, values[i]);
    }
    return out;
}

static PyObject *first_descendant_of_type(PyObject *node, PyObject *type) {
    if (py_is(node, type)) { Py_INCREF(node); return node; }
    PyObject *found = PyObject_CallMethod(node, "find", "O", type);
    if (!found) PyErr_Clear();
    return found;
}

static bool sql_visited(SqlWalk *w, PyObject *node, bool add);

static void sql_add_table(SqlWalk *w, PyObject *table, int parent, CBMSqlRole role,
                          uint32_t ordinal, const char *clause_kind,
                          const char *syntax_path) {
    if (!table || table == Py_None) return;
    PyObject *actual = first_descendant_of_type(table, w->api->table_type);
    if (!actual || actual == Py_None) { Py_XDECREF(actual); return; }
    if (sql_visited(w, actual, false)) { Py_DECREF(actual); return; }
    (void)sql_visited(w, actual, true);
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, actual, &start, &end);
    CBMSqlEntity e = sql_entity(w, CBM_SQL_TABLE_REF, parent, ordinal, start, end);
    e.name = qualified_name(w, actual);
    e.syntax_type = "table";
    e.role = role;
    e.slot = role == CBM_SQL_ROLE_TARGET ? "target" :
             role == CBM_SQL_ROLE_SOURCE ? "source" : "object";
    e.clause_kind = clause_kind;
    e.syntax_path = syntax_path;
    PyObject *version = py_arg(actual, "version");
    if (version && version != Py_None) {
        e.modifier = py_string_arena(w->ctx->arena, version);
        e.expression_kind = "temporal_table";
    }
    Py_XDECREF(version);
    e.ref_kind = e.name && (strstr(e.name, "${") || strchr(e.name, '$'))
                     ? "dynamic"
                     : "physical";
    if (role == CBM_SQL_ROLE_SOURCE && e.name &&
        (e.name[0] == '@' || e.name[0] == '~' || strstr(e.name, "://"))) {
        e.kind = CBM_SQL_EXTERNAL_SOURCE;
        e.syntax_type = "external_source";
        e.expression_kind = "stage_or_uri";
        e.ref_kind = "external";
    }
    int table_index = parent;
    bool added = sql_push(w->ctx, e, &table_index);
    if (added && role == CBM_SQL_ROLE_TARGET) {
        PyObject *columns = py_arg(table, "expressions");
        if (py_sequence(columns)) {
            Py_ssize_t count = PySequence_Size(columns);
            for (Py_ssize_t i = 0; i < count; i++) {
                PyObject *column = PySequence_GetItem(columns, i);
                if (!column) continue;
                uint32_t column_start = start, column_end = end;
                (void)sql_expr_span(w, column, &column_start, &column_end);
                CBMSqlEntity ce = sql_entity(w, CBM_SQL_COLUMN_REF, table_index,
                                             (uint32_t)i, column_start, column_end);
                ce.name = py_is(column, w->api->identifier_type)
                              ? original_identifier(w, column)
                              : py_attr_string(w->ctx->arena, column, "name");
                ce.syntax_type = "column";
                ce.role = CBM_SQL_ROLE_TARGET;
                ce.slot = "target_column";
                ce.clause_kind = clause_kind;
                ce.syntax_path = syntax_path;
                sql_push(w->ctx, ce, NULL);
                Py_DECREF(column);
            }
        }
        Py_XDECREF(columns);
    }
    Py_DECREF(actual);
}

static bool belongs_to_query(SqlWalk *w, PyObject *node, PyObject *query) {
    PyObject *cur = py_attr(node, "parent");
    while (cur && cur != Py_None) {
        if (py_is(cur, w->api->select_type) || py_is(cur, w->api->set_operation_type)) {
            bool same = cur == query;
            Py_DECREF(cur);
            return same;
        }
        PyObject *next = py_attr(cur, "parent");
        Py_DECREF(cur);
        cur = next;
    }
    Py_XDECREF(cur);
    return false;
}

static void sql_add_projection_columns(SqlWalk *w, PyObject *projection, PyObject *query,
                                       int parent) {
    PyObject *found = PyObject_CallMethod(projection, "find_all", "O", w->api->column_type);
    PyObject *it = found ? PyObject_GetIter(found) : NULL;
    PyObject *column;
    uint32_t ordinal = 0;
    while (it && (column = PyIter_Next(it))) {
        if (belongs_to_query(w, column, query)) {
            uint32_t start = 0, end = w->len;
            (void)sql_expr_span(w, column, &start, &end);
            CBMSqlEntity e = sql_entity(w, CBM_SQL_COLUMN_REF, parent, ordinal++, start, end);
            e.name = qualified_name(w, column);
            e.syntax_type = "column";
            e.role = CBM_SQL_ROLE_SOURCE;
            e.slot = "projection_input";
            e.clause_kind = "projection";
            e.syntax_path = "query.projection";
            sql_push(w->ctx, e, NULL);
        }
        Py_DECREF(column);
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_XDECREF(it);
    Py_XDECREF(found);
}

static void sql_walk_query(SqlWalk *w, PyObject *query, int owner, uint32_t ordinal);
static bool py_truthy(PyObject *value);

static bool sql_visited(SqlWalk *w, PyObject *node, bool add) {
    if (!w->visited || !node) return false;
    for (uint32_t i = 0; i < w->visited->count; i++) {
        if (w->visited->items[i] == node) return true;
    }
    if (add) {
        if (w->visited->count == w->visited->cap) {
            uint32_t cap = w->visited->cap ? w->visited->cap * 2 : 64;
            PyObject **items = realloc(w->visited->items, (size_t)cap * sizeof(*items));
            if (!items) { w->partial = true; return false; }
            w->visited->items = items;
            w->visited->cap = cap;
        }
        w->visited->items[w->visited->count++] = node;
    }
    return false;
}

static bool sql_source_meaningful(SqlWalk *w, PyObject *source) {
    if (!source || source == Py_None) return false;
    if (py_is(source, w->api->table_type) || py_is(source, w->api->subquery_type) ||
        py_is(source, w->api->query_type)) return true;
    PyObject *table = first_descendant_of_type(source, w->api->table_type);
    bool has_table = table && table != Py_None;
    Py_XDECREF(table);
    return has_table;
}

static int sql_walk_source(SqlWalk *w, PyObject *source, int owner, uint32_t ordinal,
                           const char *clause_kind, const char *syntax_path) {
    if (!source || source == Py_None) return -1;
    if (sql_visited(w, source, false)) return -1;
    if (!py_is(source, w->api->table_type)) (void)sql_visited(w, source, true);
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, source, &start, &end);
    CBMSqlEntity rel = sql_entity(w, CBM_SQL_RELATION, owner, ordinal, start, end);
    rel.name = "relation";
    rel.alias = py_attr_string(w->ctx->arena, source, "alias");
    rel.syntax_type = "relation";
    rel.role = CBM_SQL_ROLE_SOURCE;
    rel.slot = "source";
    rel.clause_kind = clause_kind;
    rel.syntax_path = syntax_path;
    int relation = owner;
    if (!sql_push(w->ctx, rel, &relation)) return -1;

    if (py_is(source, w->api->table_type)) {
        sql_add_table(w, source, relation, CBM_SQL_ROLE_SOURCE, 0,
                      clause_kind, syntax_path);
    } else if (py_is(source, w->api->subquery_type)) {
        CBMSqlEntity sub = sql_entity(w, CBM_SQL_SUBQUERY, relation, 0, start, end);
        sub.name = rel.alias ? rel.alias : "subquery";
        sub.alias = rel.alias;
        sub.syntax_type = "subquery";
        int subquery = relation;
        if (sql_push(w->ctx, sub, &subquery)) {
            PyObject *inner = py_arg(source, "this");
            if (inner) sql_walk_query(w, inner, subquery, 0);
            Py_XDECREF(inner);
        }
    } else {
        PyObject *tables = PyObject_CallMethod(source, "find_all", "O", w->api->table_type);
        PyObject *it = tables ? PyObject_GetIter(tables) : NULL;
        PyObject *table;
        uint32_t n = 0;
        while (it && (table = PyIter_Next(it))) {
            sql_add_table(w, table, relation, CBM_SQL_ROLE_SOURCE, n++,
                          clause_kind, syntax_path);
            Py_DECREF(table);
        }
        if (PyErr_Occurred()) PyErr_Clear();
        Py_XDECREF(it); Py_XDECREF(tables);
        if (n == 0) {
            PyObject *columns = PyObject_CallMethod(source, "find_all", "O",
                                                    w->api->column_type);
            PyObject *column_it = columns ? PyObject_GetIter(columns) : NULL;
            PyObject *column;
            while (column_it && (column = PyIter_Next(column_it))) {
                uint32_t column_start = start, column_end = end;
                (void)sql_expr_span(w, column, &column_start, &column_end);
                CBMSqlEntity ce = sql_entity(w, CBM_SQL_COLUMN_REF, relation, n++,
                                             column_start, column_end);
                ce.name = qualified_name(w, column);
                ce.syntax_type = "column";
                ce.role = CBM_SQL_ROLE_SOURCE;
                ce.slot = "relation_input";
                ce.clause_kind = clause_kind;
                ce.syntax_path = syntax_path;
                sql_push(w->ctx, ce, NULL);
                Py_DECREF(column);
            }
            if (PyErr_Occurred()) PyErr_Clear();
            Py_XDECREF(column_it);
            Py_XDECREF(columns);
        }
    }
    return relation;
}

static void sql_walk_structural(SqlWalk *w, PyObject *node, int owner,
                                 const char *clause, const char *path,
                                 uint32_t *ordinal, unsigned depth);

/* Keep clause semantics compact: one clause/action node plus only the columns
 * that an agent needs to understand predicates, assignments and partitions. */
static int sql_add_clause(SqlWalk *w, PyObject *expression, int owner, uint32_t ordinal,
                          const char *kind, const char *path, const char *modifier) {
    if (!expression || expression == Py_None || PyBool_Check(expression) ||
        PyLong_Check(expression) || PyUnicode_Check(expression)) return -1;
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, expression, &start, &end);
    CBMSqlEntity e = sql_entity(w, CBM_SQL_CLAUSE, owner, ordinal, start, end);
    e.name = kind;
    e.syntax_type = py_attr_string(w->ctx->arena, expression, "key");
    e.expression_kind = e.syntax_type;
    e.clause_kind = kind;
    e.syntax_path = path;
    e.modifier = modifier;
    int clause = owner;
    bool predicate = strcmp(kind, "where") == 0 || strcmp(kind, "having") == 0 ||
                     strcmp(kind, "qualify") == 0;
    if (predicate) {
        uint32_t reference_ordinal = 0;
        sql_walk_structural(w, expression, owner, kind, path, &reference_ordinal, 1);
        return owner;
    }
    if (!predicate && !sql_push(w->ctx, e, &clause)) return -1;
    bool sequence = py_sequence(expression);
    PyObject *columns = sequence ? NULL
        : PyObject_CallMethod(expression, "find_all", "O", w->api->column_type);
    PyObject *it = columns ? PyObject_GetIter(columns) : NULL;
    PyObject *column;
    uint32_t n = 0;
    Py_ssize_t sequence_count = sequence ? PySequence_Size(expression) : 0;
    while ((sequence && n < (uint32_t)sequence_count &&
            (column = PySequence_GetItem(expression, (Py_ssize_t)n))) ||
           (!sequence && it && (column = PyIter_Next(it)))) {
        uint32_t cs = start, ce = end;
        (void)sql_expr_span(w, column, &cs, &ce);
        CBMSqlEntity c = sql_entity(w, CBM_SQL_COLUMN_REF, clause, n++, cs, ce);
        c.name = qualified_name(w, column);
        c.syntax_type = "column";
        c.role = CBM_SQL_ROLE_SOURCE;
        c.slot = "clause_input";
        c.clause_kind = kind;
        c.syntax_path = path;
        sql_push(w->ctx, c, NULL);
        Py_DECREF(column);
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_XDECREF(it); Py_XDECREF(columns);
    return clause;
}

static void sql_add_assignment(SqlWalk *w, PyObject *expression, int owner,
                               uint32_t ordinal, const char *kind, const char *path) {
    if (!expression || expression == Py_None) return;
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, expression, &start, &end);
    CBMSqlEntity assignment_entity = sql_entity(w, CBM_SQL_ASSIGNMENT, owner, ordinal,
                                                 start, end);
    assignment_entity.name = kind;
    assignment_entity.syntax_type = py_attr_string(w->ctx->arena, expression, "key");
    assignment_entity.expression_kind = assignment_entity.syntax_type;
    assignment_entity.clause_kind = kind;
    assignment_entity.syntax_path = path;
    int assignment = owner;
    if (!sql_push(w->ctx, assignment_entity, &assignment)) return;
    PyObject *target = py_arg(expression, "this");
    PyObject *column = first_descendant_of_type(target, w->api->column_type);
    if (column && column != Py_None) {
        uint32_t start = 0, end = w->len;
        (void)sql_expr_span(w, column, &start, &end);
        CBMSqlEntity e = sql_entity(w, CBM_SQL_COLUMN_REF, assignment, 0, start, end);
        e.name = qualified_name(w, column);
        e.syntax_type = "column";
        e.role = CBM_SQL_ROLE_TARGET;
        e.slot = "assignment_target";
        e.clause_kind = kind;
        e.syntax_path = path;
        sql_push(w->ctx, e, NULL);
    }
    Py_XDECREF(column); Py_XDECREF(target);
    PyObject *source = py_arg(expression, "expression");
    if (source) {
        PyObject *columns = PyObject_CallMethod(source, "find_all", "O", w->api->column_type);
        PyObject *it = columns ? PyObject_GetIter(columns) : NULL;
        uint32_t n = 0;
        while (it && (column = PyIter_Next(it))) {
            uint32_t cs = start, ce = end;
            (void)sql_expr_span(w, column, &cs, &ce);
            CBMSqlEntity e = sql_entity(w, CBM_SQL_COLUMN_REF, assignment, n++, cs, ce);
            e.name = qualified_name(w, column);
            e.syntax_type = "column";
            e.role = CBM_SQL_ROLE_SOURCE;
            e.slot = "assignment_input";
            e.clause_kind = kind;
            e.syntax_path = path;
            sql_push(w->ctx, e, NULL);
            Py_DECREF(column);
        }
        if (PyErr_Occurred()) PyErr_Clear();
        Py_XDECREF(it); Py_XDECREF(columns);
    }
    Py_XDECREF(source);
}

static void sql_add_merge_action(SqlWalk *w, PyObject *when, int owner, uint32_t ordinal) {
    int action = sql_add_clause(w, when, owner, ordinal, "merge_action", "merge.whens", NULL);
    if (action < 0) return;
    PyObject *then = py_arg(when, "then");
    PyObject *items = then ? py_arg(then, "expressions") : NULL;
    if (py_sequence(items)) {
        Py_ssize_t count = PySequence_Size(items);
        for (Py_ssize_t i = 0; i < count; i++) {
            PyObject *item = PySequence_GetItem(items, i);
            if (item) sql_add_assignment(w, item, action, (uint32_t)i,
                                         "merge_assignment", "merge.whens.then");
            Py_XDECREF(item);
        }
    }
    Py_XDECREF(items); Py_XDECREF(then);
}

static void sql_add_external_source(SqlWalk *w, PyObject *value, int owner,
                                    uint32_t ordinal, const char *slot,
                                    const char *path) {
    if (!value || value == Py_None) return;
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, value, &start, &end);
    const char *name = py_string_arena(w->ctx->arena, value);
    if (!name || !name[0]) return;
    CBMSqlEntity e = sql_entity(w, CBM_SQL_EXTERNAL_SOURCE, owner, ordinal, start, end);
    e.name = name;
    e.syntax_type = py_attr_string(w->ctx->arena, value, "key");
    e.expression_kind = e.syntax_type;
    e.role = CBM_SQL_ROLE_SOURCE;
    e.slot = slot;
    e.clause_kind = slot;
    e.syntax_path = path;
    e.ref_kind = "external";
    sql_push(w->ctx, e, NULL);
}

static void sql_walk_ctes(SqlWalk *w, PyObject *query, int owner) {
    PyObject *with = py_arg(query, "with_");
    PyObject *items = with ? py_arg(with, "expressions") : NULL;
    if (!py_sequence(items)) { Py_XDECREF(items); Py_XDECREF(with); return; }
    Py_ssize_t count = PySequence_Size(items);
    for (Py_ssize_t i = 0; i < count; i++) {
        PyObject *cte = PySequence_GetItem(items, i);
        if (!cte || !py_is(cte, w->api->cte_type)) { Py_XDECREF(cte); continue; }
        uint32_t start = 0, end = w->len;
        (void)sql_expr_span(w, cte, &start, &end);
        CBMSqlEntity e = sql_entity(w, CBM_SQL_CTE, owner, (uint32_t)i, start, end);
        e.name = py_attr_string(w->ctx->arena, cte, "alias_or_name");
        e.alias = e.name;
        e.syntax_type = "cte";
        PyObject *recursive = py_arg(with, "recursive");
        if (py_truthy(recursive)) e.modifier = "recursive";
        Py_XDECREF(recursive);
        int cte_index = owner;
        if (sql_push(w->ctx, e, &cte_index)) {
            PyObject *alias = py_arg(cte, "alias");
            PyObject *declared = alias ? py_arg(alias, "columns") : NULL;
            if (!declared && alias) declared = py_arg(alias, "expressions");
            if (py_sequence(declared)) {
                Py_ssize_t declared_count = PySequence_Size(declared);
                for (Py_ssize_t j = 0; j < declared_count; j++) {
                    PyObject *column = PySequence_GetItem(declared, j);
                    if (!column) continue;
                    uint32_t cs = start, ce = end;
                    (void)sql_expr_span(w, column, &cs, &ce);
                    CBMSqlEntity out = sql_entity(w, CBM_SQL_COLUMN_REF, cte_index,
                                                  (uint32_t)j, cs, ce);
                    out.name = py_is(column, w->api->identifier_type)
                                   ? original_identifier(w, column)
                                   : py_attr_string(w->ctx->arena, column, "name");
                    out.syntax_type = "column";
                    out.role = CBM_SQL_ROLE_OUTPUT;
                    out.slot = "cte_declared_column";
                    out.clause_kind = "with";
                    out.syntax_path = "query.with.alias.columns";
                    sql_push(w->ctx, out, NULL);
                    Py_DECREF(column);
                }
            }
            Py_XDECREF(declared); Py_XDECREF(alias);
            PyObject *body = py_arg(cte, "this");
            if (body) sql_walk_query(w, body, cte_index, 0);
            Py_XDECREF(body);
        }
        Py_DECREF(cte);
    }
    Py_DECREF(items);
    Py_DECREF(with);
}

static void sql_walk_select(SqlWalk *w, PyObject *query, int query_index) {
    PyObject *from = py_arg(query, "from_");
    PyObject *source = from ? py_arg(from, "this") : NULL;
    uint32_t relation_ordinal = 0;
    if (source) sql_walk_source(w, source, query_index, relation_ordinal++,
                                "from", "query.from");
    Py_XDECREF(source);

    /* Some SQLGlot dialects preserve comma-separated FROM items in the From
     * expression list instead of normalizing all of them to joins. */
    PyObject *from_items = from ? py_arg(from, "expressions") : NULL;
    if (py_sequence(from_items)) {
        Py_ssize_t count = PySequence_Size(from_items);
        for (Py_ssize_t i = 0; i < count; i++) {
            PyObject *item = PySequence_GetItem(from_items, i);
            if (sql_source_meaningful(w, item))
                sql_walk_source(w, item, query_index, relation_ordinal++,
                                "from", "query.from");
            Py_XDECREF(item);
        }
    }
    Py_XDECREF(from_items);
    Py_XDECREF(from);

    PyObject *joins = py_arg(query, "joins");
    if (py_sequence(joins)) {
        Py_ssize_t count = PySequence_Size(joins);
        for (Py_ssize_t i = 0; i < count; i++) {
            PyObject *join = PySequence_GetItem(joins, i);
            PyObject *joined = join ? py_arg(join, "this") : NULL;
            PyObject *side_value = join ? py_arg(join, "side") : NULL;
            PyObject *kind_value = join ? py_arg(join, "kind") : NULL;
            const char *side = py_string_arena(w->ctx->arena, side_value);
            const char *kind = py_string_arena(w->ctx->arena, kind_value);
            Py_XDECREF(side_value); Py_XDECREF(kind_value);
            const char *modifier = side && side[0] && kind && kind[0]
                ? cbm_arena_sprintf(w->ctx->arena, "%s %s", side, kind)
                : (side && side[0] ? side : kind);
            int relation = -1;
            if (joined) relation = sql_walk_source(w, joined, query_index, relation_ordinal++,
                                                   "join", "query.join");
            if (relation >= 0) {
                CBMSqlEntity *stored = &w->ctx->result->sql_entities.items[relation];
                stored->modifier = modifier;
                PyObject *on = py_arg(join, "on");
                PyObject *using_columns = py_arg(join, "using");
                if (on) sql_add_clause(w, on, relation, 0, "join_on", "query.join.on",
                                       modifier);
                if (using_columns) sql_add_clause(w, using_columns, relation, 1,
                                                  "join_using", "query.join.using",
                                                  modifier);
                Py_XDECREF(on); Py_XDECREF(using_columns);
            }
            Py_XDECREF(joined); Py_XDECREF(join);
        }
    }
    Py_XDECREF(joins);

    /* LATERAL/UNNEST/PIVOT wrappers are retained as clause context. Physical
     * tables below them are still assigned to this query, while a pure
     * EXPLODE expression adds no spurious table reference. */
    const char *wrapper_slots[] = {"laterals", "pivots"};
    for (size_t slot_i = 0; slot_i < sizeof(wrapper_slots) / sizeof(wrapper_slots[0]); slot_i++) {
        PyObject *items = py_arg(query, wrapper_slots[slot_i]);
        if (py_sequence(items)) {
            Py_ssize_t count = PySequence_Size(items);
            for (Py_ssize_t i = 0; i < count; i++) {
                PyObject *item = PySequence_GetItem(items, i);
                if (item && item != Py_None) {
                    const char *path = cbm_arena_sprintf(
                        w->ctx->arena, "query.%s", wrapper_slots[slot_i]);
                    sql_walk_source(w, item, query_index, relation_ordinal++,
                                    wrapper_slots[slot_i], path);
                }
                Py_XDECREF(item);
            }
        }
        Py_XDECREF(items);
    }

    /* Scalar/EXISTS subqueries outside FROM and JOIN are still data sources.
     * SQLGlot uses the same Subquery class in every dialect, so this stays a
     * single semantic traversal rather than a dialect/class-name switch. */
    PyObject *subqueries = PyObject_CallMethod(query, "find_all", "O", w->api->subquery_type);
    PyObject *subquery_it = subqueries ? PyObject_GetIter(subqueries) : NULL;
    PyObject *subquery;
    while (subquery_it && (subquery = PyIter_Next(subquery_it))) {
        if (!sql_visited(w, subquery, false) && belongs_to_query(w, subquery, query)) {
            sql_walk_source(w, subquery, query_index, relation_ordinal++,
                            "subquery", "query.expression.subquery");
        }
        Py_DECREF(subquery);
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_XDECREF(subquery_it);
    Py_XDECREF(subqueries);

    PyObject *projections = py_arg(query, "expressions");
    if (py_sequence(projections)) {
        Py_ssize_t count = PySequence_Size(projections);
        for (Py_ssize_t i = 0; i < count; i++) {
            PyObject *projection = PySequence_GetItem(projections, i);
            if (!projection) continue;
            uint32_t start = 0, end = w->len;
            (void)sql_expr_span(w, projection, &start, &end);
            CBMSqlEntity e = sql_entity(w, CBM_SQL_PROJECTION, query_index, (uint32_t)i,
                                        start, end);
            e.name = py_attr_string(w->ctx->arena, projection, "alias_or_name");
            if (!e.name || !e.name[0]) {
                e.name = cbm_arena_sprintf(w->ctx->arena, "projection_%04u", (unsigned)i + 1);
            }
            e.alias = py_attr_string(w->ctx->arena, projection, "alias");
            e.syntax_type = "projection";
            e.expression_kind = py_attr_string(w->ctx->arena, projection, "key");
            const char *projection_sql = py_string_arena(w->ctx->arena, projection);
            size_t projection_len = projection_sql ? strlen(projection_sql) : 0;
            if ((e.expression_kind && sql_ascii_ieq(e.expression_kind, "star")) ||
                (projection_len == 1 && projection_sql[0] == '*') ||
                (projection_len >= 2 && projection_sql[projection_len - 1] == '*' &&
                 projection_sql[projection_len - 2] == '.'))
                e.modifier = "wildcard";
            e.role = CBM_SQL_ROLE_OUTPUT;
            e.slot = "projection";
            int projection_index = query_index;
            if (sql_push(w->ctx, e, &projection_index)) {
                sql_add_projection_columns(w, projection, query, projection_index);
            }
            Py_DECREF(projection);
        }
    }
    Py_XDECREF(projections);
}

static void sql_walk_query(SqlWalk *w, PyObject *query, int owner, uint32_t ordinal) {
    if (!query || query == Py_None) return;
    if (py_is(query, w->api->subquery_type)) {
        PyObject *inner = py_arg(query, "this");
        if (inner) sql_walk_query(w, inner, owner, ordinal);
        Py_XDECREF(inner);
        return;
    }
    if (!py_is(query, w->api->query_type)) return;
    if (sql_visited(w, query, false)) return;
    (void)sql_visited(w, query, true);
    uint32_t start = 0, end = w->len;
    (void)sql_expr_span(w, query, &start, &end);
    CBMSqlEntity e = sql_entity(w, CBM_SQL_QUERY, owner, ordinal, start, end);
    e.syntax_type = py_attr_string(w->ctx->arena, query, "key");
    e.detail = e.syntax_type;
    int query_index = owner;
    if (!sql_push(w->ctx, e, &query_index)) return;
    sql_walk_ctes(w, query, query_index);

    if (py_is(query, w->api->set_operation_type)) {
        PyObject *distinct = py_arg(query, "distinct");
        e.modifier = !distinct || distinct == Py_None || py_truthy(distinct)
                         ? "distinct" : "all";
        /* e has already been copied into the result; update the stored copy. */
        w->ctx->result->sql_entities.items[query_index].modifier = e.modifier;
        Py_XDECREF(distinct);
        PyObject *left = py_arg(query, "this");
        PyObject *right = py_arg(query, "expression");
        if (left) sql_walk_query(w, left, query_index, 0);
        if (right) sql_walk_query(w, right, query_index, 1);
        Py_XDECREF(left); Py_XDECREF(right);
    } else if (py_is(query, w->api->select_type)) {
        sql_walk_select(w, query, query_index);
        const char *slots[] = {"where", "having", "qualify", "group", "order"};
        for (size_t i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
            PyObject *clause = py_arg(query, slots[i]);
            if (clause) {
                const char *path = cbm_arena_sprintf(w->ctx->arena, "query.%s", slots[i]);
                sql_add_clause(w, clause, query_index, (uint32_t)i, slots[i], path, NULL);
            }
            Py_XDECREF(clause);
        }
    } else {
        /* VALUES and dialect query subclasses still expose their row/output
         * expressions even when they are neither Select nor SetOperation. */
        PyObject *expressions = py_arg(query, "expressions");
        if (py_sequence(expressions)) {
            Py_ssize_t count = PySequence_Size(expressions);
            for (Py_ssize_t i = 0; i < count; i++) {
                PyObject *item = PySequence_GetItem(expressions, i);
                if (item) sql_add_clause(w, item, query_index, (uint32_t)i,
                                         "values", "query.values", NULL);
                Py_XDECREF(item);
            }
        }
        Py_XDECREF(expressions);
    }
}

static bool sql_root_supported(SqlWalk *w, PyObject *root) {
    /* SQLGlot's
     * DDL/DML/Query traits are not a statement taxonomy (even VALUES, DROP and
     * EXPORT lack them). Keep the returned root, including opaque Command. */
    return root && root != Py_None && !py_is(root, w->api->condition_type) &&
           !py_is(root, w->api->alias_type) && !py_is(root, w->api->identifier_type);
}

/* Traverse unknown statement shapes without materializing the AST. Only
 * relational/query boundaries and column references become graph entities.
 * Argument paths retain syntax context; neutral roles avoid inventing lineage
 * for object operations such as DROP, ALTER or GRANT. */
static void sql_walk_structural(SqlWalk *w, PyObject *node, int owner,
                                 const char *clause, const char *path,
                                 uint32_t *ordinal, unsigned depth) {
    if (!node || node == Py_None) return;
    if (depth > 256 || w->ctx->result->walk_truncated) {
        w->ctx->result->walk_truncated = true;
        w->partial = true;
        return;
    }
    if (PyList_Check(node) || PyTuple_Check(node)) {
        Py_ssize_t count = PySequence_Size(node);
        for (Py_ssize_t i = 0; i < count; i++) {
            PyObject *item = PySequence_GetItem(node, i);
            const char *item_path = cbm_arena_sprintf(w->ctx->arena, "%s[%zd]", path, i);
            sql_walk_structural(w, item, owner, clause, item_path, ordinal, depth + 1);
            Py_XDECREF(item);
        }
        return;
    }
    if (py_is(node, w->api->query_type)) {
        int before = w->ctx->result->sql_entities.count;
        sql_walk_query(w, node, owner, (*ordinal)++);
        if (w->ctx->result->sql_entities.count > before) {
            w->ctx->result->sql_entities.items[before].clause_kind = clause;
            w->ctx->result->sql_entities.items[before].syntax_path = path;
        }
        return;
    }
    if (py_is(node, w->api->table_type)) {
        int before = w->ctx->result->sql_entities.count;
        sql_add_table(w, node, owner, CBM_SQL_ROLE_NEUTRAL, (*ordinal)++, clause, path);
        if (w->ctx->result->sql_entities.count > before) {
            PyObject *parent = py_attr(node, "parent");
            w->ctx->result->sql_entities.items[before].expression_kind =
                py_attr_string(w->ctx->arena, parent, "key");
            /* SQLGlot also uses Table for schemas and procedure names. The
             * enclosing operation, not this AST class alone, determines kind. */
            w->ctx->result->sql_entities.items[before].ref_kind = "unclassified_object";
            Py_XDECREF(parent);
        }
        return;
    }
    if (py_is(node, w->api->column_type)) {
        uint32_t start = 0, end = w->len;
        (void)sql_expr_span(w, node, &start, &end);
        CBMSqlEntity e = sql_entity(w, CBM_SQL_COLUMN_REF, owner, (*ordinal)++, start, end);
        e.name = qualified_name(w, node);
        e.syntax_type = "column";
        e.clause_kind = clause;
        e.syntax_path = path;
        e.slot = "structural_reference";
        if (strcmp(clause, "where") == 0 || strcmp(clause, "having") == 0 ||
            strcmp(clause, "qualify") == 0 || strcmp(clause, "values") == 0) {
            e.role = CBM_SQL_ROLE_SOURCE;
            e.slot = "clause_input";
        }
        sql_push(w->ctx, e, NULL);
        return;
    }
    PyObject *args = py_attr(node, "args");
    if (args && PyDict_Check(args)) {
        Py_ssize_t pos = 0;
        PyObject *key, *value;
        while (PyDict_Next(args, &pos, &key, &value)) {
            const char *slot = PyUnicode_Check(key) ? PyUnicode_AsUTF8(key) : NULL;
            if (!slot) continue;
            if (value == Py_None || PyUnicode_Check(value) || PyLong_Check(value) ||
                PyFloat_Check(value)) continue;
            const char *child_path = cbm_arena_sprintf(w->ctx->arena, "%s.%s", path, slot);
            sql_walk_structural(w, value, owner, depth == 0 ? slot : clause,
                                 child_path, ordinal, depth + 1);
        }
    }
    Py_XDECREF(args);
}

static bool sql_create_is_relation(SqlWalk *w, PyObject *root) {
    if (!py_is(root, w->api->create_type)) return false;
    PyObject *kind = py_arg(root, "kind");
    const char *value = py_string_arena(w->ctx->arena, kind);
    Py_XDECREF(kind);
    return sql_ascii_ieq(value, "TABLE") || sql_ascii_ieq(value, "VIEW") ||
           sql_ascii_ieq(value, "MATERIALIZED VIEW");
}

static bool py_truthy(PyObject *value) {
    if (!value || value == Py_None) return false;
    int truth = PyObject_IsTrue(value);
    if (truth < 0) { PyErr_Clear(); return false; }
    return truth != 0;
}

static bool sql_arg_has_source(SqlWalk *w, PyObject *root, const char *name) {
    PyObject *value = py_arg(root, name);
    bool present = sql_source_meaningful(w, value);
    Py_XDECREF(value);
    return present;
}

static const char *sql_statement_source_form(SqlWalk *w, PyObject *root,
                                             const char *operation, PyObject *expression) {
    if (expression && py_is(expression, w->api->query_type)) return "query";
    if (sql_arg_has_source(w, root, "like")) return "like";
    if (py_is(root, w->api->create_type)) {
        PyObject *properties = py_arg(root, "properties");
        PyObject *like = properties ? first_descendant_of_type(properties, w->api->like_property_type) : NULL;
        bool found = like && like != Py_None;
        Py_XDECREF(like); Py_XDECREF(properties);
        if (found) return "like";
    }
    if (sql_arg_has_source(w, root, "clone")) return "clone";
    if (operation && sql_ascii_ieq(operation, "copy")) return "copy";
    /* SQLGlot versions have represented CREATE TABLE ... LIKE both in a
     * dedicated `like` slot and as a Table-valued `expression`. */
    if (py_is(root, w->api->create_type) && expression &&
        py_is(expression, w->api->table_type)) return "like";
    return NULL;
}

static void sql_add_external_slots(SqlWalk *w, PyObject *root, int statement,
                                   const char *operation) {
    if (!operation || !(sql_ascii_ieq(operation, "copy") ||
                        sql_ascii_ieq(operation, "load") ||
                        sql_ascii_ieq(operation, "loaddata") ||
                        sql_ascii_ieq(operation, "unload") ||
                        sql_ascii_ieq(operation, "export"))) return;
    const char *slots[] = {"files", "location", "path", "source", "uri", "inpath"};
    uint32_t ordinal = 0;
    for (size_t i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
        PyObject *value = py_arg(root, slots[i]);
        if (!value || value == Py_None) { Py_XDECREF(value); continue; }
        const char *path = cbm_arena_sprintf(w->ctx->arena, "%s.%s", operation, slots[i]);
        if (py_sequence(value)) {
            Py_ssize_t count = PySequence_Size(value);
            for (Py_ssize_t j = 0; j < count; j++) {
                PyObject *item = PySequence_GetItem(value, j);
                sql_add_external_source(w, item, statement, ordinal++, slots[i], path);
                Py_XDECREF(item);
            }
        } else if (!sql_source_meaningful(w, value)) {
            sql_add_external_source(w, value, statement, ordinal++, slots[i], path);
        }
        Py_DECREF(value);
    }
}

static bool sql_identifier_equal(const char *left, const char *right) {
    if (!left || !right || strchr(left, '.')) return false;
    size_t ln = strlen(left), rn = strlen(right);
    bool lquoted = ln >= 2 && ((left[0] == '"' && left[ln - 1] == '"') ||
                              (left[0] == '`' && left[ln - 1] == '`') ||
                              (left[0] == '[' && left[ln - 1] == ']'));
    bool rquoted = rn >= 2 && ((right[0] == '"' && right[rn - 1] == '"') ||
                              (right[0] == '`' && right[rn - 1] == '`') ||
                              (right[0] == '[' && right[rn - 1] == ']'));
    if (lquoted) { left++; ln -= 2; }
    if (rquoted) { right++; rn -= 2; }
    if (ln != rn) return false;
    if (lquoted || rquoted) return memcmp(left, right, ln) == 0;
    for (size_t i = 0; i < ln; i++)
        if (toupper((unsigned char)left[i]) != toupper((unsigned char)right[i])) return false;
    return true;
}

static void sql_mark_cte_refs(CBMFileResult *result, int begin) {
    if (!result) return;
    CBMSqlEntityArray *a = &result->sql_entities;
    int cte_count = 0;
    for (int i = begin; i < a->count; i++) cte_count += a->items[i].kind == CBM_SQL_CTE;
    int *ctes = cte_count ? malloc((size_t)cte_count * sizeof(*ctes)) : NULL;
    int cte_at = 0;
    for (int i = begin; ctes && i < a->count; i++)
        if (a->items[i].kind == CBM_SQL_CTE) ctes[cte_at++] = i;
    for (int i = begin; i < a->count; i++) {
        CBMSqlEntity *ref = &a->items[i];
        if (ref->kind != CBM_SQL_TABLE_REF || ref->role != CBM_SQL_ROLE_SOURCE ||
            !ref->name || !ref->name[0]) continue;
        /* Resolve at the nearest enclosing query. Only CTEs directly declared
         * by that query are visible, so nested WITH shadowing is preserved. */
        for (int owner = ref->parent; owner >= begin; owner = a->items[owner].parent) {
            if (a->items[owner].kind != CBM_SQL_QUERY &&
                a->items[owner].kind != CBM_SQL_STATEMENT) continue;
            int candidates = ctes ? cte_count : a->count - begin;
            for (int ci = 0; ci < candidates; ci++) {
                int j = ctes ? ctes[ci] : begin + ci;
                CBMSqlEntity *cte = &a->items[j];
                if (cte->kind == CBM_SQL_CTE && cte->parent == owner && cte->name &&
                    sql_identifier_equal(ref->name, cte->name)) {
                    int enclosing_cte = ref->parent;
                    while (enclosing_cte >= begin && enclosing_cte != owner &&
                           a->items[enclosing_cte].parent != owner)
                        enclosing_cte = a->items[enclosing_cte].parent;
                    if (enclosing_cte >= begin && a->items[enclosing_cte].kind == CBM_SQL_CTE &&
                        !(cte->modifier && !strcmp(cte->modifier, "recursive")) &&
                        cte->ordinal >= a->items[enclosing_cte].ordinal) continue;
                    ref->kind = CBM_SQL_CTE_REF;
                    ref->ref_kind = "cte";
                    ref->resolved_entity = j;
                    goto next_ref;
                }
            }
        }
next_ref:
        ;
    }
    free(ctes);
}

static const char *sql_dialect_provenance(SqlWalk *w) {
    const char *configured = getenv("CBM_SQL_DIALECT");
    if (configured && w->dialect && sql_ascii_ieq(configured, w->dialect))
        return "environment";
    const char *hint_source = NULL;
    const char *hint = cbm_sql_dialect_hint_get(&hint_source);
    if (hint && w->dialect && sql_ascii_ieq(hint, w->dialect))
        return hint_source ? hint_source : "profile";
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX] = {{0}};
    int count = cbm_sql_dialect_candidates(w->original, w->len, candidates);
    for (int i = 0; i < count; i++)
        if (w->dialect && sql_ascii_ieq(candidates[i].name, w->dialect)) return "syntax";
    return w->dialect && strcmp(w->dialect, "sqlglot") != 0 ? "parser-probe" : "generic";
}

/* Preserve cheap operation flags (kind, exists, cascade, etc.) as one compact
 * attribute, without serializing child expressions or copying the AST. */
static const char *sql_scalar_modifiers(SqlWalk *w, PyObject *root) {
    PyObject *args = py_attr(root, "args");
    PyObject *scalars = PyDict_New();
    if (args && scalars && PyDict_Check(args)) {
        Py_ssize_t pos = 0;
        PyObject *key, *value;
        while (PyDict_Next(args, &pos, &key, &value)) {
            if (PyUnicode_Check(value) || PyBool_Check(value) || PyLong_Check(value)) {
                if (PyDict_SetItem(scalars, key, value) < 0) PyErr_Clear();
            }
        }
    }
    const char *result = NULL;
    if (scalars && PyDict_Size(scalars)) {
        PyObject *json = PyImport_ImportModule("json");
        PyObject *text = json ? PyObject_CallMethod(json, "dumps", "O", scalars) : NULL;
        result = py_string_arena(w->ctx->arena, text);
        Py_XDECREF(text); Py_XDECREF(json);
    }
    Py_XDECREF(scalars); Py_XDECREF(args);
    if (PyErr_Occurred()) PyErr_Clear();
    return result;
}

static void sql_walk_statement(SqlWalk *w, PyObject *root, uint32_t ordinal) {
    int statement_begin = w->ctx->result->sql_entities.count;
    uint32_t start = 0, end = w->len;
    /* Statement coordinates cover the whole segment, including its keyword;
     * descendant metadata often starts only at the first identifier. */
    CBMSqlEntity e = sql_entity(w, CBM_SQL_STATEMENT, -1, ordinal, start, end);
    e.name = cbm_arena_sprintf(w->ctx->arena, "statement_%04u", ordinal + 1);
    e.syntax_type = py_attr_string(w->ctx->arena, root, "key");
    e.detail = w->dialect;
    e.dialect_source = sql_dialect_provenance(w);
    const char *hint_source = NULL;
    const char *hint = cbm_sql_dialect_hint_get(&hint_source);
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX] = {{0}};
    int candidate_count = cbm_sql_dialect_candidates(w->original, w->len, candidates);
    char evidence[512];
    int used = snprintf(evidence, sizeof(evidence), "hint=%s; hint_source=%s; candidates=",
                        hint ? hint : "none", hint_source ? hint_source : "none");
    for (int i = 0; i < candidate_count && used >= 0 && (size_t)used < sizeof(evidence); i++)
        used += snprintf(evidence + used, sizeof(evidence) - (size_t)used,
                         "%s%s:%u", i ? "," : "", candidates[i].name, candidates[i].score);
    e.dialect_evidence = cbm_arena_strdup(w->ctx->arena, evidence);
    e.operation = e.syntax_type;
    e.statement_ordinal = ordinal;
    bool specialized = py_is(root, w->api->query_type) || py_is(root, w->api->dml_type) ||
                       py_is(root, w->api->ddl_type);
    bool opaque = py_is(root, w->api->command_type);
    e.expression_kind = opaque ? "opaque_command" : specialized ? "specialized" : "structural";
    if (!specialized && !opaque) e.modifier = sql_scalar_modifiers(w, root);
    if (opaque) {
        e.partial = true;
        e.error_count = 1;
        PyObject *command = py_arg(root, "this");
        e.operation = py_string_arena(w->ctx->arena, command);
        Py_XDECREF(command);
    }
    PyObject *query = py_arg(root, "expression");
    e.source_form = sql_statement_source_form(w, root, e.operation, query);
    if (e.operation && sql_ascii_ieq(e.operation, "insert")) {
        PyObject *overwrite = py_arg(root, "overwrite");
        e.write_mode = py_truthy(overwrite) ? "overwrite" : "into";
        Py_XDECREF(overwrite);
    } else if (e.operation && sql_ascii_ieq(e.operation, "create")) {
        PyObject *replace = py_arg(root, "replace");
        if (py_truthy(replace)) e.write_mode = "replace";
        Py_XDECREF(replace);
    }
    int statement = -1;
    if (!sql_push(w->ctx, e, &statement)) { Py_XDECREF(query); return; }
    w->statement_index = statement;
    w->statement_ordinal = ordinal;
    /* WITH belongs to the DML root in WITH ... INSERT, not to its SELECT. */
    if (!py_is(root, w->api->query_type)) sql_walk_ctes(w, root, statement);
    if (!specialized) {
        if (!opaque) {
            uint32_t reference_ordinal = 0;
            sql_walk_structural(w, root, statement, "statement", e.operation,
                                 &reference_ordinal, 0);
            sql_add_external_slots(w, root, statement, e.operation);
            sql_mark_cte_refs(w->ctx->result, statement_begin);
        }
        Py_XDECREF(query);
        return;
    }

    /* SQLGlot normalizes write destinations into `this`. Only DML and CREATE
     * are lineage targets: DROP/ALTER name a table but do not move data. */
    PyObject *target = NULL;
    bool data_statement = py_is(root, w->api->dml_type) || sql_create_is_relation(w, root);
    if (data_statement) {
        target = py_arg(root, "this");
        const char *target_clause = cbm_arena_sprintf(
            w->ctx->arena, "%s_target", e.operation ? e.operation : "statement");
        const char *target_path = cbm_arena_sprintf(
            w->ctx->arena, "%s.this", e.operation ? e.operation : "statement");
        sql_add_table(w, target, statement, CBM_SQL_ROLE_TARGET, 0,
                      target_clause, target_path);
    }
    if (py_is(root, w->api->query_type)) {
        sql_walk_query(w, root, statement, 0);
    } else {
        if (query && py_is(query, w->api->query_type)) {
            sql_walk_query(w, query, statement, 0);
        } else {
            /* SQLGlot normalizes dialect-specific source clauses into stable
             * AST argument slots. This covers UPDATE ... FROM, MERGE ... USING,
             * CREATE ... LIKE/AS-table and similar forms without branching on
             * dialect-specific expression class names. */
            uint32_t qstart = 0, qend = w->len;
            (void)sql_expr_span(w, root, &qstart, &qend);
            CBMSqlEntity qe = sql_entity(w, CBM_SQL_QUERY, statement, 0, qstart, qend);
            qe.syntax_type = py_attr_string(w->ctx->arena, root, "key");
            qe.detail = qe.syntax_type;
            int query_index = statement;
            uint32_t source_ordinal = 0;
            bool made_query = false;
            const char *source_slots[] = {"from_", "using", "like", "clone", "source"};
            const char *source_clauses[] = {"from", "using", "like", "clone", "source"};
            for (size_t i = 0; i < sizeof(source_slots) / sizeof(source_slots[0]); i++) {
                PyObject *clause = py_arg(root, source_slots[i]);
                if (!clause || clause == Py_None) { Py_XDECREF(clause); continue; }
                PyObject *source = NULL;
                if (py_is(clause, w->api->table_type) ||
                    py_is(clause, w->api->subquery_type) ||
                    py_is(clause, w->api->query_type)) {
                    source = clause;
                    Py_INCREF(source);
                } else {
                    source = py_arg(clause, "this");
                }
                if (!source) { Py_DECREF(clause); continue; }
                if (sql_source_meaningful(w, source)) {
                    if (!made_query && sql_push(w->ctx, qe, &query_index)) made_query = true;
                    if (made_query) {
                        const char *path = cbm_arena_sprintf(
                            w->ctx->arena, "%s.%s", e.operation ? e.operation : "statement",
                            source_slots[i]);
                        sql_walk_source(w, source, query_index, source_ordinal++,
                                        source_clauses[i], path);
                    }
                }
                Py_DECREF(source);
                Py_DECREF(clause);
            }
            if (query && query != Py_None && !sql_source_meaningful(w, query)) {
                uint32_t reference_ordinal = 0;
                sql_walk_structural(w, query, statement, "values", "statement.expression",
                                    &reference_ordinal, 1);
            }
            if (sql_source_meaningful(w, query)) {
                if (!made_query && sql_push(w->ctx, qe, &query_index)) made_query = true;
                if (made_query) {
                    const char *clause = e.source_form ? e.source_form : "expression";
                    const char *path = cbm_arena_sprintf(
                        w->ctx->arena, "%s.expression",
                        e.operation ? e.operation : "statement");
                    sql_walk_source(w, query, query_index, source_ordinal++, clause, path);
                }
            }

            /* Preserve uncommon dialect slots without flattening the whole
             * statement with find_all(Table). Only direct root arguments are
             * inspected, and the argument key becomes clause_kind. This keeps
             * COPY/CLONE/vendor clauses visible while retaining ownership. */
            PyObject *args = py_attr(root, "args");
            if (args && PyDict_Check(args)) {
                Py_ssize_t pos = 0;
                PyObject *key = NULL, *value = NULL;
                while (PyDict_Next(args, &pos, &key, &value)) {
                    const char *slot = PyUnicode_Check(key) ? PyUnicode_AsUTF8(key) : NULL;
                    if (!slot || strcmp(slot, "this") == 0 || strcmp(slot, "expression") == 0 ||
                        strcmp(slot, "expressions") == 0 || strcmp(slot, "with_") == 0 ||
                        strcmp(slot, "from_") == 0 || strcmp(slot, "using") == 0 ||
                        strcmp(slot, "like") == 0 || strcmp(slot, "clone") == 0 ||
                        strcmp(slot, "source") == 0) continue;
                    const char *path = cbm_arena_sprintf(
                        w->ctx->arena, "%s.%s", e.operation ? e.operation : "statement", slot);
                    if (strcmp(slot, "properties") == 0 && e.source_form &&
                        strcmp(e.source_form, "like") == 0) {
                        PyObject *like = first_descendant_of_type(value, w->api->like_property_type);
                        PyObject *table = like ? py_arg(like, "this") : NULL;
                        if (table) sql_add_table(w, table, statement, CBM_SQL_ROLE_SOURCE,
                                                source_ordinal++, "like", path);
                        Py_XDECREF(table); Py_XDECREF(like);
                        continue;
                    }
                    if (py_sequence(value)) {
                        Py_ssize_t count = PySequence_Size(value);
                        for (Py_ssize_t item_i = 0; item_i < count; item_i++) {
                            PyObject *item = PySequence_GetItem(value, item_i);
                            if (sql_source_meaningful(w, item)) {
                                if (!made_query && sql_push(w->ctx, qe, &query_index))
                                    made_query = true;
                                if (made_query)
                                    sql_walk_source(w, item, query_index, source_ordinal++,
                                                    slot, path);
                            }
                            Py_XDECREF(item);
                        }
                    } else if (sql_source_meaningful(w, value)) {
                        if (!made_query && sql_push(w->ctx, qe, &query_index)) made_query = true;
                        if (made_query)
                            sql_walk_source(w, value, query_index, source_ordinal++, slot, path);
                    }
                }
            }
            Py_XDECREF(args);
        }
    }
    Py_XDECREF(query);
    PyObject *target_table = target ? first_descendant_of_type(target, w->api->table_type) : NULL;
    PyObject *table_partition = target_table ? py_arg(target_table, "partition") : NULL;
    if (table_partition) sql_add_clause(w, table_partition, statement, 0, "partition",
                                        "statement.this.partition", NULL);
    Py_XDECREF(table_partition); Py_XDECREF(target_table);
    Py_XDECREF(target);
    sql_add_external_slots(w, root, statement, e.operation);

    /* DML action semantics are small but essential: source columns alone do
     * not tell an agent which destination column an UPDATE/MERGE writes. */
    if (e.operation && (sql_ascii_ieq(e.operation, "update") ||
                        sql_ascii_ieq(e.operation, "merge"))) {
        PyObject *assignments = py_arg(root, "expressions");
        if (py_sequence(assignments)) {
            Py_ssize_t count = PySequence_Size(assignments);
            for (Py_ssize_t i = 0; i < count; i++) {
                PyObject *item = PySequence_GetItem(assignments, i);
                if (item) sql_add_assignment(w, item, statement, (uint32_t)i,
                                             "assignment", "statement.expressions");
                Py_XDECREF(item);
            }
        }
        Py_XDECREF(assignments);
        PyObject *whens = py_arg(root, "whens");
        PyObject *when_items = whens ? py_arg(whens, "expressions") : NULL;
        if (py_sequence(when_items)) {
            Py_ssize_t count = PySequence_Size(when_items);
            for (Py_ssize_t i = 0; i < count; i++) {
                PyObject *item = PySequence_GetItem(when_items, i);
                if (item) sql_add_merge_action(w, item, statement, (uint32_t)i);
                Py_XDECREF(item);
            }
        }
        Py_XDECREF(when_items); Py_XDECREF(whens);
    }
    PyObject *partition = py_arg(root, "partition");
    if (partition) sql_add_clause(w, partition, statement, 0, "partition",
                                  "statement.partition", NULL);
    Py_XDECREF(partition);
    if (!py_is(root, w->api->query_type)) {
        PyObject *where = py_arg(root, "where");
        if (where) sql_add_clause(w, where, statement, 0, "where", "statement.where", NULL);
        Py_XDECREF(where);
    }
    sql_mark_cte_refs(w->ctx->result, statement_begin);
}

typedef enum { Q_NONE, Q_SINGLE, Q_DOUBLE, Q_BACKTICK, Q_BRACKET, Q_LINE_COMMENT,
               Q_BLOCK_COMMENT, Q_DOLLAR } SqlQuote;

typedef struct { uint32_t kind, start, end; } SqlFactSpan;
static int sql_fact_cmp(const void *a, const void *b) {
    const SqlFactSpan *x = a, *y = b;
    if (x->kind != y->kind) return x->kind < y->kind ? -1 : 1;
    if (x->start != y->start) return x->start < y->start ? -1 : 1;
    return (x->end > y->end) - (x->end < y->end);
}

/* Optimizer hints can contain SQLGlot Column/Table objects naming aliases,
 * not data references. Their token offsets may even be relative to the hint
 * text parsed separately by SQLGlot; never treat them as missing SQL facts. */
static bool sql_in_optimizer_hint(PyObject *node) {
    PyObject *parent = py_attr(node, "parent");
    while (parent && parent != Py_None) {
        PyObject *key = py_attr(parent, "key");
        bool hint = key && PyUnicode_Check(key) &&
                    PyUnicode_CompareWithASCIIString(key, "hint") == 0;
        Py_XDECREF(key);
        if (hint) { Py_DECREF(parent); return true; }
        PyObject *next = py_attr(parent, "parent");
        Py_DECREF(parent);
        parent = next;
    }
    Py_XDECREF(parent);
    return false;
}

/* Check retained reference facts, not every AST operator. A successful parse
 * must not silently certify a lossy projection as complete. */
static bool sql_verify_projection(SqlWalk *w, PyObject *root, int begin) {
    CBMSqlEntityArray *entities = &w->ctx->result->sql_entities;
    int count = entities->count - begin;
    SqlFactSpan *spans = count > 0 ? malloc((size_t)count * sizeof(*spans)) : NULL;
    if (count && !spans) { w->ctx->result->walk_truncated = true; return false; }
    int n = 0;
    for (int i = begin; i < entities->count; i++) {
        CBMSqlEntity *e = &entities->items[i];
        uint32_t kind = e->kind == CBM_SQL_CTE ? 2 : e->kind == CBM_SQL_COLUMN_REF ? 1 : 0;
        if (e->kind == CBM_SQL_TABLE_REF || e->kind == CBM_SQL_CTE_REF ||
            e->kind == CBM_SQL_COLUMN_REF || e->kind == CBM_SQL_CTE)
            spans[n++] = (SqlFactSpan){kind, e->start_byte, e->end_byte};
    }
    if (n) qsort(spans, (size_t)n, sizeof(*spans), sql_fact_cmp);
    PyObject *types[] = {w->api->table_type, w->api->column_type, w->api->cte_type};
    uint32_t expected = 0, missing = 0;
    for (uint32_t kind = 0; kind < 3; kind++) {
        PyObject *found = PyObject_CallMethod(root, "find_all", "O", types[kind]);
        PyObject *it = found ? PyObject_GetIter(found) : NULL, *item;
        while (it && (item = PyIter_Next(it))) {
            if (sql_in_optimizer_hint(item)) { Py_DECREF(item); continue; }
            uint32_t a = 0, b = w->len;
            expected++;
            if (!sql_expr_span(w, item, &a, &b)) missing++;
            else {
                SqlFactSpan key = {kind, w->base + a, w->base + b};
                if (!n || !bsearch(&key, spans, (size_t)n, sizeof(*spans), sql_fact_cmp)) missing++;
            }
            Py_DECREF(item);
        }
        if (PyErr_Occurred()) { PyErr_Clear(); missing++; }
        Py_XDECREF(it); Py_XDECREF(found);
    }
    free(spans);
    if (w->statement_index >= 0) {
        CBMSqlEntity *stmt = &entities->items[w->statement_index];
        stmt->ast_reference_count = expected;
        stmt->missing_reference_count = missing;
        if (missing) { stmt->partial = true; stmt->error_count++; }
    }
    return missing == 0;
}

static uint32_t sql_dollar_tag_len(const char *source, uint32_t len, uint32_t at) {
    if (at >= len || source[at] != '$') return 0;
    uint32_t i = at + 1;
    while (i < len && (isalnum((unsigned char)source[i]) || source[i] == '_')) i++;
    return i < len && source[i] == '$' ? i - at + 1 : 0;
}

static bool sql_dynamic_name_char(unsigned char c);

/* Replace dynamic fragments outside strings/comments with identifier-safe
 * bytes while preserving byte-for-byte length and every source coordinate. */
static char *sql_mask_dynamic(const char *source, uint32_t len) {
    char *out = malloc((size_t)len + 1);
    if (!out) return NULL;
    memcpy(out, source, len);
    out[len] = '\0';
    SqlQuote q = Q_NONE;
    uint32_t dollar_start = 0, dollar_tag_len = 0;
    for (uint32_t i = 0; i < len; i++) {
        char c = source[i], n = i + 1 < len ? source[i + 1] : '\0';
        if (q == Q_LINE_COMMENT) { if (c == '\n') q = Q_NONE; continue; }
        if (q == Q_BLOCK_COMMENT) { if (c == '*' && n == '/') { q = Q_NONE; i++; } continue; }
        if (q == Q_SINGLE) { if (c == '\\' && n) i++; else if (c == '\'' && n == '\'') i++; else if (c == '\'') q = Q_NONE; continue; }
        if (q == Q_DOUBLE) { if (c == '\\' && n) i++; else if (c == '"' && n == '"') i++; else if (c == '"') q = Q_NONE; continue; }
        if (q == Q_BACKTICK) { if (c == '\\' && n) i++; else if (c == '`' && n == '`') i++; else if (c == '`') q = Q_NONE; continue; }
        if (q == Q_BRACKET) { if (c == ']' && n == ']') i++; else if (c == ']') q = Q_NONE; continue; }
        if (q == Q_DOLLAR) {
            if (c == '$' && i + dollar_tag_len <= len &&
                memcmp(source + i, source + dollar_start, dollar_tag_len) == 0) {
                i += dollar_tag_len - 1; q = Q_NONE;
            }
            continue;
        }
        if (c == '-' && n == '-') { q = Q_LINE_COMMENT; i++; continue; }
        if (c == '/' && n == '*') { q = Q_BLOCK_COMMENT; i++; continue; }
        if (c == '\'') { q = Q_SINGLE; continue; }
        if (c == '"') { q = Q_DOUBLE; continue; }
        if (c == '`') { q = Q_BACKTICK; continue; }
        if (c == '[') { q = Q_BRACKET; continue; }
        if ((c == ':' || c == '@') && c != n &&
            (isalpha((unsigned char)n) || n == '_')) {
            uint32_t j = i + 2;
            while (j < len && sql_dynamic_name_char((unsigned char)source[j])) j++;
            out[i] = 'v';
            for (uint32_t k = i + 1; k < j; k++) out[k] = '_';
            i = j - 1;
            continue;
        }
        if (c != '$') continue;

        uint32_t tag_len = sql_dollar_tag_len(source, len, i);
        if (tag_len) {
            dollar_start = i;
            dollar_tag_len = tag_len;
            q = Q_DOLLAR;
            i += tag_len - 1;
            continue;
        }

        if (n == '{') {
            uint32_t j = i + 2;
            while (j < len && source[j] != '}' && source[j] != '\n') j++;
            if (j < len && source[j] == '}') {
                out[i] = 'v';
                for (uint32_t k = i + 1; k <= j; k++) out[k] = '_';
                i = j;
            }
        } else if (isalpha((unsigned char)n) || n == '_') {
            uint32_t j = i + 1;
            while (j < len && (isalnum((unsigned char)source[j]) || source[j] == '_')) j++;
            out[i] = 'v';
            for (uint32_t k = i + 1; k < j; k++) out[k] = '_';
            i = j - 1;
        }
    }
    return out;
}

/* Prefer the selected file dialect. Probe alternatives only after failure or
 * opaque Command fallback; AST size is not evidence of dialect correctness. */
static bool sql_try_parse(SqlWalk *w, const char *sql, uint32_t len, PyObject **tree,
                          const char **dialect_used) {
    const char *configured = getenv("CBM_SQL_DIALECT");
    const char *hint = cbm_sql_dialect_hint_get(NULL);
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX] = {{0}};
    int count = cbm_sql_dialect_candidates(sql, len, candidates);
    cbm_sql_dialect_order_candidates(candidates, count);
    const char *order[4 + CBM_SQL_DIALECT_CANDIDATE_MAX] = {0};
    int n = 0;
    if (configured && *configured) order[n++] = configured;
    if (hint && *hint) order[n++] = hint;
    for (int i = 0; i < count; i++) order[n++] = candidates[i].name;
    if (w->dialect && strcmp(w->dialect, "sqlglot")) order[n++] = w->dialect;
    order[n++] = NULL; /* Always try the generic grammar before accepting Command. */
    PyObject *opaque = NULL;
    const char *opaque_dialect = NULL;
    for (int i = 0; i < n; i++) {
        bool duplicate = false;
        for (int j = 0; j < i; j++)
            if (order[i] && order[j] && !strcmp(order[i], order[j])) duplicate = true;
        if (duplicate) continue;
        PyObject *parsed = cbm_sqlglot_parse(w->api, sql, len, order[i]);
        if (parsed && sql_root_supported(w, parsed)) {
            if (!py_is(parsed, w->api->command_type)) {
                Py_XDECREF(opaque);
                *tree = parsed;
                *dialect_used = order[i] ? order[i] : "sqlglot";
                return true;
            }
            if (!opaque) {
                opaque = parsed;
                opaque_dialect = order[i] ? order[i] : "sqlglot";
                parsed = NULL;
            }
        }
        Py_XDECREF(parsed);
    }
    if (!opaque) return false;
    *tree = opaque;
    *dialect_used = opaque_dialect;
    return true;
}

static bool sql_candidate_maybe_statement(SqlWalk *w, const char *sql, uint32_t len) {
    const char *configured = getenv("CBM_SQL_DIALECT");
    if (configured && configured[0] &&
        cbm_sqlglot_maybe_statement(w->api, sql, len, configured, false)) return true;
    const char *hint = cbm_sql_dialect_hint_get(NULL);
    if (hint && hint[0] && (!configured || strcmp(configured, hint) != 0) &&
        cbm_sqlglot_maybe_statement(w->api, sql, len, hint, false)) return true;
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX] = {{0}};
    int count = cbm_sql_dialect_candidates(sql, len, candidates);
    for (int i = 0; i < count; i++) {
        const char *dialect = candidates[i].name;
        if ((!configured || strcmp(configured, dialect) != 0) &&
            (!hint || strcmp(hint, dialect) != 0) &&
            cbm_sqlglot_maybe_statement(w->api, sql, len, dialect, false)) return true;
    }
    return cbm_sqlglot_maybe_statement(w->api, sql, len, NULL, false);
}

static bool sql_parse_island(SqlWalk *base, uint32_t start, uint32_t end,
                             uint32_t *statement_ordinal, SqlRecoveryGaps *gaps) {
    if (gaps) memset(gaps, 0, sizeof(*gaps));
    while (start < end && isspace((unsigned char)base->masked[start])) start++;
    while (end > start && isspace((unsigned char)base->masked[end - 1])) end--;
    if (start >= end) return true;

    uint32_t candidates[SQLGLOT_RECOVERY_ATTEMPTS];
    uint32_t count = 0;
    candidates[count++] = start;
    SqlQuote q = Q_NONE;
    uint32_t dollar_start = 0, dollar_tag_len = 0;
    for (uint32_t i = start; i < end && count < SQLGLOT_RECOVERY_ATTEMPTS; i++) {
        char ch = base->original[i];
        char next = i + 1 < end ? base->original[i + 1] : '\0';
        if (q == Q_LINE_COMMENT) { if (ch == '\n') q = Q_NONE; continue; }
        if (q == Q_BLOCK_COMMENT) {
            if (ch == '*' && next == '/') { q = Q_NONE; i++; }
            continue;
        }
        if (q == Q_SINGLE) {
            if (ch == '\\' && next) i++;
            else if (ch == '\'' && next == '\'') i++;
            else if (ch == '\'') q = Q_NONE;
            continue;
        }
        if (q == Q_DOUBLE) {
            if (ch == '\\' && next) i++;
            else if (ch == '"' && next == '"') i++;
            else if (ch == '"') q = Q_NONE;
            continue;
        }
        if (q == Q_BACKTICK) { if (ch == '\\' && next) i++; else if (ch == '`' && next == '`') i++; else if (ch == '`') q = Q_NONE; continue; }
        if (q == Q_BRACKET) { if (ch == ']' && next == ']') i++; else if (ch == ']') q = Q_NONE; continue; }
        if (q == Q_DOLLAR) {
            if (ch == '$' && i + dollar_tag_len <= end &&
                memcmp(base->original + i, base->original + dollar_start,
                       dollar_tag_len) == 0) {
                i += dollar_tag_len - 1;
                q = Q_NONE;
            }
            continue;
        }
        if (ch == '-' && next == '-') { q = Q_LINE_COMMENT; i++; continue; }
        if (ch == '/' && next == '*') { q = Q_BLOCK_COMMENT; i++; continue; }
        if (ch == '\'') { q = Q_SINGLE; continue; }
        if (ch == '"') { q = Q_DOUBLE; continue; }
        if (ch == '`') { q = Q_BACKTICK; continue; }
        if (ch == '[') { q = Q_BRACKET; continue; }
        uint32_t tag_len = sql_dollar_tag_len(base->original, end, i);
        if (tag_len) {
            dollar_start = i;
            dollar_tag_len = tag_len;
            q = Q_DOLLAR;
            i += tag_len - 1;
            continue;
        }
        if (i <= start) continue;
        unsigned char c = (unsigned char)base->masked[i];
        unsigned char p = (unsigned char)base->masked[i - 1];
        if ((isalpha(c) || c == '_') && !(isalnum(p) || p == '_')) candidates[count++] = i;
    }
    uint32_t line_ends[64];
    uint32_t line_end_count = 0;
    for (uint32_t i = start; i < end && line_end_count < 64; i++) {
        if (base->original[i] == '\n') line_ends[line_end_count++] = i;
    }
    for (uint32_t i = 0; i < count; i++) {
        uint32_t at = candidates[i];
        /* Give the complete segment to the parser even when its first token
         * is not registered (OPEN SCHEMA, procedural WHILE, etc.). Only
         * recovery inside a failed segment needs a keyword boundary guard. */
        if (i > 0 && !sql_candidate_maybe_statement(base, base->masked + at, end - at)) continue;
        for (int endpoint = (int)line_end_count; endpoint >= 0; endpoint--) {
            uint32_t stop = endpoint == (int)line_end_count ? end : line_ends[endpoint];
            if (stop <= at) continue;
            while (stop > at && isspace((unsigned char)base->masked[stop - 1])) stop--;
            PyObject *tree = NULL;
            const char *dialect = NULL;
            if (!sql_try_parse(base, base->masked + at, stop - at, &tree, &dialect)) continue;
            SqlWalk walk = *base;
            SqlVisited visited = {0};
            walk.original = base->original + at;
            walk.masked = base->masked + at;
            walk.base = base->base + at;
            walk.len = stop - at;
            walk.dialect = dialect;
            walk.partial = at > start || stop < end;
            walk.error_count = walk.partial ? 1u : 0u;
            walk.visited = &visited;
            int entity_begin = walk.ctx->result->sql_entities.count;
            sql_walk_statement(&walk, tree, (*statement_ordinal)++);
            bool projection_ok = py_is(tree, walk.api->command_type) ||
                                 sql_verify_projection(&walk, tree, entity_begin);
            if (!projection_ok) {
                walk.partial = true;
                if (gaps) {
                    gaps->starts[gaps->count] = at;
                    gaps->ends[gaps->count++] = stop;
                }
            }
            if (py_is(tree, walk.api->command_type)) {
                walk.partial = true;
                if (gaps) {
                    gaps->starts[0] = start;
                    gaps->ends[0] = end;
                    gaps->count = 1;
                }
            }
            if (walk.partial) {
                base->partial = true;
                if (gaps && !py_is(tree, walk.api->command_type) && at > start) {
                    gaps->starts[gaps->count] = start;
                    gaps->ends[gaps->count++] = at;
                }
                if (gaps && !py_is(tree, walk.api->command_type) && stop < end) {
                    gaps->starts[gaps->count] = stop;
                    gaps->ends[gaps->count++] = end;
                }
            }
            base->dialect = dialect;
            Py_DECREF(tree);
            free(visited.items);
            return true;
        }
    }
    return false;
}

static bool sql_is_unparsed_sql(SqlWalk *walk, uint32_t start, uint32_t end) {
    /* Unknown code is a gap too; this does not interpret its DSL semantics.
     * Only whitespace/comments may disappear without a coverage diagnostic. */
    for (uint32_t at = start; at < end;) {
        if (isspace((unsigned char)walk->original[at])) { at++; continue; }
        if (at + 1 < end && walk->original[at] == '-' && walk->original[at + 1] == '-') {
            while (at < end && walk->original[at] != '\n') at++;
            continue;
        }
        if (at + 1 < end && walk->original[at] == '/' && walk->original[at + 1] == '*') {
            at += 2;
            while (at + 1 < end && !(walk->original[at] == '*' && walk->original[at + 1] == '/')) at++;
            if (at + 1 >= end) return true;
            at += 2;
            continue;
        }
        return true;
    }
    return false;
}

static const char *sql_error_ranges(SqlWalk *w, const uint32_t *starts,
                                    const uint32_t *ends, uint32_t count) {
    if (!count) return NULL;
    char *out = cbm_arena_alloc(w->ctx->arena, (size_t)count * 32 + 1);
    if (!out) return NULL;
    size_t used = 0;
    for (uint32_t i = 0; i < count; i++) {
        uint32_t sl, sc, el, ec;
        sql_walk_line_column(w, starts[i], &sl, &sc);
        /* Error spans are half-open.  Mapping `end` itself can therefore
         * select the following line when the span ends at a line boundary. */
        sql_walk_line_column(w, ends[i] - 1, &el, &ec);
        (void)sc; (void)ec;
        used += (size_t)snprintf(out + used, (size_t)count * 32 + 1 - used,
                                 "%s%u-%u", i ? "," : "", sl, el);
    }
    return out;
}

static bool sql_error_append(SqlWalk *w, uint32_t **starts, uint32_t **ends,
                             uint32_t *count, uint32_t *capacity,
                             uint32_t start, uint32_t end) {
    /* Segment boundaries include the newline after the preceding semicolon
     * and recovery gaps can include indentation before/after the failed
     * fragment.  Keep only source bytes that can actually be unparsed. */
    for (;;) {
        while (start < end && isspace((unsigned char)w->masked[start])) start++;
        if (start + 1 < end && w->original[start] == '-' && w->original[start + 1] == '-') {
            while (start < end && w->original[start] != '\n') start++;
        } else if (start + 1 < end && w->original[start] == '/' && w->original[start + 1] == '*') {
            uint32_t at = start + 2;
            unsigned depth = 1;
            while (at + 1 < end && depth) {
                if (w->original[at] == '/' && w->original[at + 1] == '*') { depth++; at += 2; }
                else if (w->original[at] == '*' && w->original[at + 1] == '/') { depth--; at += 2; }
                else at++;
            }
            if (depth) break;
            start = at;
        } else break;
    }
    while (end > start && isspace((unsigned char)w->masked[end - 1])) end--;
    if (start >= end) return true;
    if (*count == *capacity) {
        uint32_t next_capacity = *capacity ? *capacity * 2 : 16;
        uint32_t *next_starts = malloc((size_t)next_capacity * sizeof(*next_starts));
        uint32_t *next_ends = malloc((size_t)next_capacity * sizeof(*next_ends));
        if (!next_starts || !next_ends) {
            free(next_starts);
            free(next_ends);
            return false;
        }
        if (*count) {
            memcpy(next_starts, *starts, (size_t)*count * sizeof(*next_starts));
            memcpy(next_ends, *ends, (size_t)*count * sizeof(*next_ends));
        }
        free(*starts);
        free(*ends);
        *starts = next_starts;
        *ends = next_ends;
        *capacity = next_capacity;
    }
    (*starts)[*count] = start;
    (*ends)[*count] = end;
    (*count)++;
    return true;
}

static void sql_add_unparsed_regions(SqlWalk *w, const uint32_t *starts,
                                     const uint32_t *ends, uint32_t count) {
    CBMSqlEntityArray *a = &w->ctx->result->sql_entities;
    for (uint32_t i = 0; i < count; i++) {
        int parent = -1;
        uint32_t statement_ordinal = i;
        for (int j = 0; j < a->count; j++) {
            CBMSqlEntity *candidate = &a->items[j];
            if (candidate->kind == CBM_SQL_STATEMENT &&
                candidate->start_byte < ends[i] && candidate->end_byte > starts[i]) {
                parent = j;
                statement_ordinal = candidate->statement_ordinal;
                break;
            }
        }
        CBMSqlEntity e = sql_entity(w, CBM_SQL_UNPARSED_REGION, parent, i,
                                    starts[i], ends[i]);
        /* Preserve half-open byte/column coordinates while making end_line
         * the line that contains the final byte of the region. */
        uint32_t last_line = 0, last_column = 0;
        sql_walk_line_column(w, ends[i] - 1, &last_line, &last_column);
        e.end_line = last_line;
        e.end_column = last_column + 1;
        e.name = cbm_arena_sprintf(w->ctx->arena, "unparsed_%04u", i + 1);
        e.syntax_type = "unparsed_region";
        e.clause_kind = parent >= 0 && a->items[parent].missing_reference_count
                           ? "extraction_gap" : "unparsed_code";
        e.syntax_path = "statement.unparsed";
        e.statement_ordinal = statement_ordinal;
        e.partial = true;
        e.error_count = 1;
        sql_push(w->ctx, e, NULL);
    }
}

static bool sql_dynamic_name_char(unsigned char c) {
    return isalnum(c) || c == '_' || c == '.' || c == '-';
}

/* Return a canonical config key for one dynamic spelling.  This is deliberately
 * syntax-only: deciding which initialization supplies the key belongs to the
 * cross-file config linking pass, where the caller workflow is available. */
static const char *sql_dynamic_name(CBMExtractCtx *ctx, const char *source,
                                    uint32_t start, uint32_t end) {
    uint32_t a = start, b = end;
    if (b >= a + 4 && source[a] == '{' && source[a + 1] == '{' &&
        source[b - 2] == '}' && source[b - 1] == '}') {
        a += 2;
        b -= 2;
    } else if (b >= a + 3 && source[a] == '$' && source[a + 1] == '{' &&
               source[b - 1] == '}') {
        a += 2;
        b--;
    } else if (a < b && (source[a] == '$' || source[a] == ':' || source[a] == '@')) {
        a++;
    }
    while (a < b && isspace((unsigned char)source[a])) a++;
    while (b > a && isspace((unsigned char)source[b - 1])) b--;
    if (a < b && source[a] == '$') a++;
    if (a >= b || !(isalpha((unsigned char)source[a]) || source[a] == '_')) return NULL;
    for (uint32_t i = a; i < b; i++)
        if (!sql_dynamic_name_char((unsigned char)source[i])) return NULL;
    return cbm_arena_strndup(ctx->arena, source + a, b - a);
}

static int sql_dynamic_parent(const CBMSqlEntityArray *a, int count,
                              uint32_t start, uint32_t end) {
    int best = -1;
    uint32_t best_width = UINT32_MAX;
    for (int i = 0; i < count; i++) {
        const CBMSqlEntity *e = &a->items[i];
        if (e->start_byte > start || e->end_byte < end) continue;
        uint32_t width = e->end_byte - e->start_byte;
        if (width < best_width) {
            best = i;
            best_width = width;
        }
    }
    return best;
}

static void sql_add_dynamic_ref(SqlWalk *w, int existing_count, uint32_t start,
                                uint32_t end, uint32_t ordinal) {
    const char *name = sql_dynamic_name(w->ctx, w->ctx->source, start, end);
    if (!name) return;
    CBMSqlEntityArray *a = &w->ctx->result->sql_entities;
    int parent = sql_dynamic_parent(a, existing_count, start, end);
    CBMSqlEntity e = {0};
    e.kind = CBM_SQL_VARIABLE_REF;
    e.name = name;
    e.syntax_type = "dynamic_variable";
    e.detail = cbm_arena_strndup(w->ctx->arena, w->ctx->source + start, end - start);
    e.slot = "dynamic_input";
    e.ref_kind = "dynamic";
    e.role = CBM_SQL_ROLE_SOURCE;
    e.parent = parent;
    e.resolved_entity = -1;
    e.ordinal = ordinal;
    e.start_byte = start;
    e.end_byte = end;
    if (parent >= 0) {
        e.statement_ordinal = a->items[parent].statement_ordinal;
        e.clause_kind = a->items[parent].clause_kind;
        e.syntax_path = a->items[parent].syntax_path;
        e.partial = a->items[parent].partial;
        e.error_count = a->items[parent].error_count;
    } else {
        e.syntax_path = "dynamic_ref";
    }
    sql_walk_line_column(w, start, &e.start_line, &e.start_column);
    sql_walk_line_column(w, end, &e.end_line, &e.end_column);
    sql_push(w->ctx, e, NULL);
}

/* Dynamic variables must survive masking as first-class, source-addressable
 * uses.  Comments and PostgreSQL dollar-quoted bodies are ignored; ordinary
 * string literals are intentionally scanned because workflow placeholders are
 * commonly embedded in SQL strings and paths. */
static void sql_add_dynamic_refs(SqlWalk *w) {
    const char *source = w->ctx->source;
    uint32_t len = (uint32_t)w->ctx->source_len;
    int existing_count = w->ctx->result->sql_entities.count;
    uint32_t ordinal = 0;
    SqlQuote q = Q_NONE;
    uint32_t dollar_start = 0, dollar_tag_len = 0;
    for (uint32_t i = 0; i < len; i++) {
        char c = source[i], n = i + 1 < len ? source[i + 1] : '\0';
        if (q == Q_LINE_COMMENT) { if (c == '\n') q = Q_NONE; continue; }
        if (q == Q_BLOCK_COMMENT) {
            if (c == '*' && n == '/') { q = Q_NONE; i++; }
            continue;
        }
        if (q == Q_DOLLAR) {
            if (c == '$' && i + dollar_tag_len <= len &&
                memcmp(source + i, source + dollar_start, dollar_tag_len) == 0) {
                i += dollar_tag_len - 1;
                q = Q_NONE;
            }
            continue;
        }
        if (q == Q_NONE) {
            if (c == '-' && n == '-') { q = Q_LINE_COMMENT; i++; continue; }
            if (c == '/' && n == '*') { q = Q_BLOCK_COMMENT; i++; continue; }
            uint32_t tag_len = sql_dollar_tag_len(source, len, i);
            if (tag_len) {
                dollar_start = i;
                dollar_tag_len = tag_len;
                q = Q_DOLLAR;
                i += tag_len - 1;
                continue;
            }
        }

        uint32_t end = i;
        if (c == '{' && n == '{') {
            end = i + 2;
            while (end + 1 < len && !(source[end] == '}' && source[end + 1] == '}') &&
                   source[end] != '\n') end++;
            if (end + 1 < len && source[end] == '}' && source[end + 1] == '}') end += 2;
            else end = i;
        } else if (c == '$' && n == '{') {
            end = i + 2;
            while (end < len && source[end] != '}' && source[end] != '\n') end++;
            if (end < len && source[end] == '}') end++;
            else end = i;
        } else if (c == '$' && (isalpha((unsigned char)n) || n == '_')) {
            end = i + 2;
            while (end < len && sql_dynamic_name_char((unsigned char)source[end])) end++;
        } else if (q == Q_NONE && (c == ':' || c == '@') && c != n &&
                   (isalpha((unsigned char)n) || n == '_')) {
            end = i + 2;
            while (end < len && sql_dynamic_name_char((unsigned char)source[end])) end++;
        }
        if (end > i) {
            sql_add_dynamic_ref(w, existing_count, i, end, ordinal++);
            i = end - 1;
            continue;
        }

        if (q == Q_SINGLE) {
            if (c == '\\' && n) i++;
            else if (c == '\'' && n == '\'') i++;
            else if (c == '\'') q = Q_NONE;
        } else if (q == Q_DOUBLE) {
            if (c == '\\' && n) i++;
            else if (c == '"' && n == '"') i++;
            else if (c == '"') q = Q_NONE;
        } else if (q == Q_BACKTICK) {
            if (c == '\\' && n) i++;
            else if (c == '`' && n == '`') i++;
            else if (c == '`') q = Q_NONE;
        } else if (q == Q_BRACKET) {
            if (c == ']' && n == ']') i++;
            else if (c == ']') q = Q_NONE;
        } else if (c == '\'') q = Q_SINGLE;
        else if (c == '"') q = Q_DOUBLE;
        else if (c == '`') q = Q_BACKTICK;
        else if (c == '[') q = Q_BRACKET;
    }
}

void cbm_extract_sql_structure(CBMExtractCtx *ctx) {
    if (!ctx || ctx->language != CBM_LANG_SQL || !ctx->source || ctx->source_len <= 0) return;
    CBMSqlglotGilState gil;
    const CBMSqlglotApi *api = NULL;
    if (!cbm_sqlglot_enter(&gil, &api)) {
        ctx->result->has_error = true;
        ctx->result->parse_incomplete = true;
        ctx->result->parse_unusable = true;
        ctx->result->error_ranges = cbm_arena_sprintf(
            ctx->arena, "1-%u", cbm_source_line_count(ctx->source, ctx->source_len));
        ctx->result->error_msg = cbm_arena_strdup(ctx->arena, "embedded SQLGlot unavailable");
        return;
    }
    char *masked = sql_mask_dynamic(ctx->source, (uint32_t)ctx->source_len);
    if (!masked) { cbm_sqlglot_leave(gil); return; }
    uint32_t line_count = 1;
    for (int i = 0; i < ctx->source_len; i++) line_count += ctx->source[i] == '\n';
    uint32_t *line_starts = malloc((size_t)line_count * sizeof(*line_starts));
    if (line_starts) {
        uint32_t line = 0;
        line_starts[line++] = 0;
        for (int i = 0; i < ctx->source_len && line < line_count; i++)
            if (ctx->source[i] == '\n') line_starts[line++] = (uint32_t)i + 1;
    }
    SqlWalk walk = {.ctx = ctx, .api = api, .original = ctx->source, .masked = masked,
                    .base = 0, .len = (uint32_t)ctx->source_len, .dialect = "sqlglot",
                    .statement_index = -1, .line_starts = line_starts,
                    .line_count = line_starts ? line_count : 0};

    uint32_t *error_starts = NULL, *error_ends = NULL, errors = 0, error_cap = 0;
    uint32_t statement_ordinal = 0, segment_start = 0;
    SqlQuote q = Q_NONE;
    uint32_t dollar_start = 0, dollar_tag_len = 0;
    for (uint32_t i = 0; i < (uint32_t)ctx->source_len; i++) {
        char c = ctx->source[i];
        char n = i + 1 < (uint32_t)ctx->source_len ? ctx->source[i + 1] : '\0';
        if (q == Q_LINE_COMMENT) { if (c == '\n') q = Q_NONE; continue; }
        if (q == Q_BLOCK_COMMENT) { if (c == '*' && n == '/') { q = Q_NONE; i++; } continue; }
        if (q == Q_SINGLE) { if (c == '\\' && n) i++; else if (c == '\'' && n == '\'') i++; else if (c == '\'') q = Q_NONE; continue; }
        if (q == Q_DOUBLE) { if (c == '\\' && n) i++; else if (c == '"' && n == '"') i++; else if (c == '"') q = Q_NONE; continue; }
        if (q == Q_BACKTICK) { if (c == '\\' && n) i++; else if (c == '`' && n == '`') i++; else if (c == '`') q = Q_NONE; continue; }
        if (q == Q_BRACKET) { if (c == ']' && n == ']') i++; else if (c == ']') q = Q_NONE; continue; }
        if (q == Q_DOLLAR) {
            if (c == '$' && i + dollar_tag_len <= (uint32_t)ctx->source_len &&
                memcmp(ctx->source + i, ctx->source + dollar_start, dollar_tag_len) == 0) {
                i += dollar_tag_len - 1;
                q = Q_NONE;
            }
            continue;
        }
        if (c == '-' && n == '-') { q = Q_LINE_COMMENT; i++; continue; }
        if (c == '/' && n == '*') { q = Q_BLOCK_COMMENT; i++; continue; }
        if (c == '\'') { q = Q_SINGLE; continue; }
        if (c == '"') { q = Q_DOUBLE; continue; }
        if (c == '`') { q = Q_BACKTICK; continue; }
        if (c == '[') { q = Q_BRACKET; continue; }
        uint32_t tag_len = sql_dollar_tag_len(ctx->source, (uint32_t)ctx->source_len, i);
        if (tag_len) {
            dollar_start = i;
            dollar_tag_len = tag_len;
            q = Q_DOLLAR;
            i += tag_len - 1;
            continue;
        }
        if (c != ';') continue;
        uint32_t end = i;
        SqlRecoveryGaps gaps = {0};
        bool parsed = sql_parse_island(&walk, segment_start, end, &statement_ordinal, &gaps);
        if (parsed) {
            for (uint32_t gap = 0; gap < gaps.count; gap++) {
                if (!sql_error_append(&walk, &error_starts, &error_ends, &errors, &error_cap,
                                      gaps.starts[gap], gaps.ends[gap])) {
                    ctx->result->walk_truncated = true;
                    break;
                }
            }
        } else if (sql_is_unparsed_sql(&walk, segment_start, end) &&
                   !sql_error_append(&walk, &error_starts, &error_ends, &errors, &error_cap,
                                     segment_start, end)) {
            ctx->result->walk_truncated = true;
            break;
        }
        segment_start = i + 1;
    }
    uint32_t final_end = (uint32_t)ctx->source_len;
    SqlRecoveryGaps final_gaps = {0};
    bool final_parsed =
        sql_parse_island(&walk, segment_start, final_end, &statement_ordinal, &final_gaps);
    if (final_parsed) {
        for (uint32_t gap = 0; gap < final_gaps.count; gap++) {
            if (!sql_error_append(&walk, &error_starts, &error_ends, &errors, &error_cap,
                                  final_gaps.starts[gap], final_gaps.ends[gap])) {
                ctx->result->walk_truncated = true;
                break;
            }
        }
    } else if (sql_is_unparsed_sql(&walk, segment_start, final_end) &&
               !sql_error_append(&walk, &error_starts, &error_ends, &errors, &error_cap,
                                 segment_start, final_end)) {
        ctx->result->walk_truncated = true;
    }
    if (errors || walk.partial) {
        uint64_t unparsed_bytes = 0;
        for (uint32_t i = 0; i < errors; i++)
            unparsed_bytes += error_ends[i] - error_starts[i];
        sql_add_unparsed_regions(&walk, error_starts, error_ends, errors);
        ctx->result->parse_incomplete = true;
        ctx->result->parse_unusable = statement_ordinal == 0 ||
            unparsed_bytes * 5 >= (uint64_t)ctx->source_len * 4;
        ctx->result->error_region_count = errors ? (int)errors : 1;
        ctx->result->error_ranges = errors
            ? sql_error_ranges(&walk, error_starts, error_ends, errors)
            : cbm_arena_sprintf(ctx->arena, "1-%u", line_count);
        ctx->result->error_msg = cbm_arena_strdup(ctx->arena, "SQLGlot partial parse");
        for (int i = 0; i < ctx->result->sql_entities.count; i++) {
            CBMSqlEntity *entity = &ctx->result->sql_entities.items[i];
            if (entity->kind == CBM_SQL_STATEMENT) {
                unsigned overlapping = 0;
                for (uint32_t j = 0; j < errors; j++)
                    if (entity->start_byte < error_ends[j] &&
                        entity->end_byte > error_starts[j]) overlapping++;
                if (overlapping) {
                    entity->partial = true;
                    if (entity->error_count < overlapping) entity->error_count = overlapping;
                }
            }
        }
    }
    sql_add_dynamic_refs(&walk);
    free(masked);
    free(line_starts);
    free(error_starts); free(error_ends);
    cbm_sqlglot_leave(gil);
}

#else

void cbm_extract_sql_structure(CBMExtractCtx *ctx) {
    (void)ctx;
}

#endif
