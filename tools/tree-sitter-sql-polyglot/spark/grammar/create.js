import { paren_list, comma_list } from "../../grammar/helpers.js";

export default {
  _table_settings: $ => choice(
    $.table_partition,
    $.stored_as,
    $.storage_location,
    $.table_sort,
    $.table_cluster,
    $.row_format,
    seq($.keyword_tblproperties, paren_list($.table_option, true)),
    seq($.keyword_without, $.keyword_oids),
    $.storage_parameters,
    // USING <data_source> [OPTIONS (...)]; the canonical Spark/Delta table form
    $.table_using,
    // OPTIONS (...) without a preceding USING (allowed in some Spark DDL contexts)
    $.table_options,
    // COMMENT 'string'; table-level comment
    seq($.keyword_comment, alias($.literal, $.literal)),
    // Databricks SHALLOW CLONE / DEEP CLONE
    $.shallow_clone,
    $.table_option,
  ),

  // USING <format>  e.g. USING delta, USING parquet, USING org.apache.spark.sql.json
  table_using: $ => seq(
    $.keyword_using,
    field('format', $.object_reference),
  ),

  // OPTIONS ( key = value [, ...] )
  table_options: $ => seq(
    $.keyword_options,
    paren_list($.table_option, true),
  ),

  shallow_clone: $ => seq(
    choice($.keyword_shallow, $.keyword_deep),
    $.keyword_clone,
    field('source', $.object_reference),
  ),

  // Spark view: the base view plus the data-source form
  //   CREATE [OR REPLACE] [TEMPORARY] VIEW [IF NOT EXISTS] name [(cols)]
  //     [USING source] [OPTIONS (…)] [COMMENT '…'] [TBLPROPERTIES (…)]
  //     [AS query]
  // AS is optional here because a USING-backed temporary view has no query.
  create_view: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._temporary),
    optional($.keyword_recursive),
    $.keyword_view,
    optional($._if_not_exists),
    field("target", $.object_reference),
    optional(paren_list($.identifier)),
    optional($.table_using),
    optional($.table_options),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_tblproperties, paren_list($.table_option, true))),
    optional(seq($.keyword_as, $.create_query)),
  )),

  // CREATE TABLE [IF NOT EXISTS] target LIKE source [USING src] [LOCATION 'p']
  // https://spark.apache.org/docs/latest/sql-ref-syntax-ddl-create-table-like.html
  // OSS Spark syntax that previously existed only in the databricks grammar,
  // so plain Spark could not parse it. Databricks inherits it from here.
  create_table_like: $ => seq(
    $.keyword_create,
    $.keyword_table,
    optional($._if_not_exists),
    field('target', $.object_reference),
    $.keyword_like,
    field('source', $.object_reference),
    optional(seq($.keyword_using, $.identifier)),
    optional(seq($.keyword_location, alias($._literal_string, $.literal))),
  ),

};
