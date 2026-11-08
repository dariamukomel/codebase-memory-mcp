#ifndef CBM_SQL_DIALECT_H
#define CBM_SQL_DIALECT_H

#include <stddef.h>

enum { CBM_SQL_DIALECT_CANDIDATE_MAX = 4 };

typedef struct {
    const char *name;
    unsigned score;
} CBMSqlDialectCandidate;

/* Return a short, ranked set of dialects suggested by distinctive syntax.
 * This is deliberately not a parser and does not decide whether a statement
 * carries lineage.  It only avoids probing SQLGlot's complete registry. */
int cbm_sql_dialect_candidates(const char *sql, size_t len,
                               CBMSqlDialectCandidate out[CBM_SQL_DIALECT_CANDIDATE_MAX]);

/* Pipeline-owned hint for the file currently extracted by this thread. */
void cbm_sql_dialect_hint_set(const char *dialect, const char *source);
const char *cbm_sql_dialect_hint_get(const char **source);
/* Fallback ordering, not additional dialect probes. Names are immutable. */
void cbm_sql_dialect_preferences_set(const char *directory, const char *const *ranked, int count);
void cbm_sql_dialect_order_candidates(CBMSqlDialectCandidate *candidates, int count);

#endif
