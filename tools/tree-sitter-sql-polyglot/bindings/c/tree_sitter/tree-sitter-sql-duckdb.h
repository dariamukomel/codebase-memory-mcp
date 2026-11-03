#ifndef TREE_SITTER_SQL_DUCKDB_H_
#define TREE_SITTER_SQL_DUCKDB_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_duckdb_sql(void);

#ifdef __cplusplus
}
#endif

#endif // TREE_SITTER_SQL_DUCKDB_H_
