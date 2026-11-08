#ifndef CBM_SQLGLOT_RUNTIME_H
#define CBM_SQLGLOT_RUNTIME_H

#include <stdbool.h>
#include <stddef.h>

typedef struct _object PyObject;
typedef int CBMSqlglotGilState;

typedef struct {
    PyObject *parse_one;
    PyObject *tokenize;
    PyObject *statement_parsers;
    PyObject *query_start_tokens;
    PyObject *dialect_classes;
    PyObject *query_type;
    PyObject *dml_type;
    PyObject *ddl_type;
    PyObject *create_type;
    PyObject *command_type;
    PyObject *condition_type;
    PyObject *like_property_type;
    PyObject *table_type;
    PyObject *column_type;
    PyObject *identifier_type;
    PyObject *cte_type;
    PyObject *subquery_type;
    PyObject *select_type;
    PyObject *set_operation_type;
    PyObject *alias_type;
} CBMSqlglotApi;

/* Lazily initialized by the first SQL extraction; other languages pay no
 * CPython/SQLGlot startup cost. */
bool cbm_sqlglot_runtime_init(void);
bool cbm_sqlglot_runtime_available(void);

/* Every caller touching PyObject values must hold this session. */
bool cbm_sqlglot_enter(CBMSqlglotGilState *state, const CBMSqlglotApi **api);
void cbm_sqlglot_leave(CBMSqlglotGilState state);

/* Parse with the selected SQLGlot dialect. Returns a new reference. */
PyObject *cbm_sqlglot_parse(const CBMSqlglotApi *api, const char *sql, size_t len,
                            const char *dialect);

/* True when SQLGlot's own tokenizer sees a statement/query-leading token.
 * Recovery uses this to ignore arbitrary GSQL/control-language chunks without
 * maintaining a second, hard-coded list of SQL statements in C. */
bool cbm_sqlglot_maybe_statement(const CBMSqlglotApi *api, const char *sql, size_t len,
                                 const char *dialect, bool any_position);

#endif
