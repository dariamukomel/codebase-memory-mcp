#ifndef TREE_SITTER_SQL_SQLITE_H_
#define TREE_SITTER_SQL_SQLITE_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_sqlite_sql(void);

#ifdef __cplusplus
}
#endif

#endif // TREE_SITTER_SQL_SQLITE_H_
