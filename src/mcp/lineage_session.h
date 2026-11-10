#ifndef CBM_LINEAGE_SESSION_H
#define CBM_LINEAGE_SESSION_H
#include <stdbool.h>
#include <sqlite3.h>
extern const char cbm_lineage_session_schema[];
/* Returns malloc-owned JSON. graph is read-only evidence; all writes go to
 * the explicitly selected output directory's separate session database. */
char *cbm_lineage_session(sqlite3 *graph, const char *project, const char *args, bool *error);
#endif
