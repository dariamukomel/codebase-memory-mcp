#ifndef CBM_SQL_DIALECT_PROFILE_H
#define CBM_SQL_DIALECT_PROFILE_H

#include "discover/discover.h"

typedef struct CBMSqlDialectProfile CBMSqlDialectProfile;

/* Bounded source pre-scan.  The returned profile is immutable and therefore
 * safe to share with all extraction workers. */
CBMSqlDialectProfile *cbm_sql_dialect_profile_build(const cbm_file_info_t *files,
                                                    int file_count);
const char *cbm_sql_dialect_profile_hint(const CBMSqlDialectProfile *profile, int file_index,
                                         const char **source);
const char *cbm_sql_dialect_profile_hint_path(const CBMSqlDialectProfile *profile,
                                              const char *rel_path, const char **source);
void cbm_sql_dialect_profile_free(CBMSqlDialectProfile *profile);
/* Set the current worker's file hint and directory/project fallback ordering. */
void cbm_sql_dialect_profile_apply_path(const CBMSqlDialectProfile *profile, const char *rel_path);

#endif
