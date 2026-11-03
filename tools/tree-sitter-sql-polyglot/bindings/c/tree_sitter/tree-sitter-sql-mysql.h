#ifndef TREE_SITTER_SQL_MYSQL_H_
#define TREE_SITTER_SQL_MYSQL_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_mysql_sql(void);

#ifdef __cplusplus
}
#endif

#endif // TREE_SITTER_SQL_MYSQL_H_
