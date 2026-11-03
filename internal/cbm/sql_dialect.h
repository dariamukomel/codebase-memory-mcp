#ifndef CBM_SQL_DIALECT_H
#define CBM_SQL_DIALECT_H

#include "tree_sitter/api.h"

#include <stdbool.h>
#include <stddef.h>

typedef struct {
    const char *name;
    const TSLanguage *language;
    bool explicit_selection;
} CBMSqlDialectChoice;

/* Select one of the SQL Polyglot grammars. Selection order is:
 *   1. a cbm:dialect=<name> directive in a SQL line/block comment;
 *   2. CBM_SQL_DIALECT when set to a dialect other than "auto";
 *   3. path and syntax hints, resolved by comparing candidate parse quality;
 *   4. the ANSI/base grammar.
 * Unknown explicit names deliberately fall back to auto selection. */
CBMSqlDialectChoice cbm_sql_dialect_choose(const char *source, size_t source_len,
                                           const char *rel_path);

/* Lookup is public to the C core so tests and future repository configuration
 * can validate a dialect without duplicating aliases. */
const TSLanguage *cbm_sql_dialect_language(const char *name);
const char *cbm_sql_dialect_canonical_name(const char *name);

#endif
