#ifndef TREE_SITTER_CLICKHOUSE_SQL_H_
#define TREE_SITTER_CLICKHOUSE_SQL_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_clickhouse_sql(void);

#ifdef __cplusplus
}
#endif

#endif // TREE_SITTER_CLICKHOUSE_SQL_H_
