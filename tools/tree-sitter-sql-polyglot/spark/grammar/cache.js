import { comma_list } from '../../grammar/helpers.js';

// Spark SQL cache management.
//
// These are OSS Spark statements, not Databricks extensions:
//   CACHE TABLE   https://spark.apache.org/docs/latest/sql-ref-syntax-aux-cache-cache-table.html
//   UNCACHE TABLE https://spark.apache.org/docs/latest/sql-ref-syntax-aux-cache-uncache-table.html
//   CLEAR CACHE   https://spark.apache.org/docs/latest/sql-ref-syntax-aux-cache-clear-cache.html
// They previously lived in the databricks grammar, which meant plain Spark
// could not parse syntax its own reference documents. Databricks inherits
// them from here unchanged.
export default {

  // CACHE [LAZY] TABLE name [AS query]
  cache_table: $ => prec.left(seq(
    $.keyword_cache,
    optional($.keyword_lazy),
    $.keyword_table,
    $.object_reference,
    optional(seq($.keyword_as, $._dml_read)),
  )),

  // UNCACHE TABLE [IF EXISTS] name
  uncache_table: $ => seq(
    $.keyword_uncache,
    $.keyword_table,
    optional($._if_exists),
    $.object_reference,
  ),

  // CLEAR CACHE
  clear_cache: $ => seq(
    $.keyword_clear,
    $.keyword_cache,
  ),

  // SHOW COLLATIONS [ LIKE pattern ]
  // https://spark.apache.org/docs/latest/sql-ref-syntax-aux-show-collations.html
  // Kept as its own statement rather than overriding hive's show_statement:
  // an override replaces the parent rule wholesale, so it would silently drop
  // any SHOW alternative hive later adds (SHOW VIEWS/COLUMNS/LOCKS/... all
  // now live there).
  show_collations_statement: $ => prec.right(seq(
    $.keyword_show,
    $.keyword_collations,
    optional(seq(optional($.keyword_like), alias($._literal_string, $.literal))),
  )),

  // { DESC | DESCRIBE } [ TABLE ] [ EXTENDED | FORMATTED ] table [PARTITION] [col]
  // https://spark.apache.org/docs/latest/sql-ref-syntax-aux-describe-table.html
  // Hive's rule has no optional TABLE keyword, so `DESCRIBE TABLE t` failed.
  // Overriding replaces the parent rule wholesale, so Hive's shape is
  // re-stated here with the keyword added.
  describe_statement: $ => prec.right(seq(
    choice($.keyword_describe, $.keyword_desc),
    optional($.keyword_table),
    optional(choice($.keyword_formatted, $.keyword_extended)),
    $.object_reference,
    optional($.partition_spec),
    optional(field('column', $.identifier)),
  )),

  // { DESC | DESCRIBE } QUERY input_statement
  // https://spark.apache.org/docs/latest/sql-ref-syntax-aux-describe-query.html
  // Another OSS Spark statement that only lived in databricks; Databricks now
  // inherits it from here.
  describe_query: $ => seq(
    choice($.keyword_describe, $.keyword_desc),
    $.keyword_query,
    choice($._dml_read, $.object_reference),
  ),

  // SET PATH = path_element [, ...]
  // https://spark.apache.org/docs/latest/sql-ref-syntax-aux-conf-mgmt-set-path.html
  set_path_statement: $ => seq(
    $.keyword_set,
    $.keyword_path,
    '=',
    comma_list($._path_element, true),
  ),

  _path_element: $ => choice(
    $.keyword_default_path,
    $.keyword_system_path,
    $.keyword_path,
    $.keyword_current_schema,
    $.keyword_current_database,
    $.object_reference,
  ),

};
