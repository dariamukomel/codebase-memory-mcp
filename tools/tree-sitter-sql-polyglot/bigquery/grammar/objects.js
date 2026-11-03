import { comma_list, paren_list } from '../../grammar/helpers.js';

// BigQuery DDL that had no rule at all. Every shape below is transcribed from
// the syntax block of its own section in
// https://cloud.google.com/bigquery/docs/reference/standard-sql/data-definition-language
export default {

  // CREATE [OR REPLACE] TABLE [IF NOT EXISTS] t
  //   {LIKE | COPY | CLONE} source [FOR SYSTEM_TIME AS OF t] [OPTIONS(…)]
  //
  // Three sibling variants of CREATE TABLE that share one shape. CLONE is the
  // only one that documents a time-travel qualifier, but accepting it on all
  // three keeps the rule flat; over-acceptance here is limited to a construct
  // BigQuery would reject anyway.
  create_table_from_source: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_table,
    optional($._if_not_exists),
    field('target', $.object_reference),
    choice($.keyword_like, $.keyword_copy, $.keyword_clone),
    field('source', $.object_reference),
    optional($.for_system_time_as_of),
    optional($.options_clause),
  )),

  // CREATE EXTERNAL SCHEMA [IF NOT EXISTS] name
  //   [WITH CONNECTION conn] [OPTIONS(…)]
  create_external_schema: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_schema,
    optional($._if_not_exists),
    field('name', $.object_reference),
    optional(seq($.keyword_with, $.keyword_connection, field('connection', $.object_reference))),
    optional($.options_clause),
  )),

  // CREATE [OR REPLACE] ROW ACCESS POLICY [IF NOT EXISTS] name ON table
  //   [GRANT TO (grantee, …)] FILTER USING (expr)
  create_row_access_policy: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_row,
    $.keyword_access,
    $.keyword_policy,
    optional($._if_not_exists),
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
    optional(seq(
      $.keyword_grant,
      $.keyword_to,
      paren_list(alias($._literal_string, $.literal), true),
    )),
    $.keyword_filter,
    $.keyword_using,
    '(',
    field('condition', $._expression),
    ')',
  ),

  // DROP ROW ACCESS POLICY [IF EXISTS] name ON table
  drop_row_access_policy: $ => seq(
    $.keyword_drop,
    $.keyword_row,
    $.keyword_access,
    $.keyword_policy,
    optional($._if_exists),
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
  ),

  // CREATE {CAPACITY | RESERVATION | ASSIGNMENT} `path` OPTIONS(…)
  // CREATE [OR REPLACE] DATA_POLICY [IF NOT EXISTS] `path` OPTIONS(…)
  // CREATE CONNECTION [IF NOT EXISTS] `path` OPTIONS(…)
  create_admin_object: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $._admin_object_type,
    optional($._if_not_exists),
    field('name', $.object_reference),
    optional($.options_clause),
  )),

  // ALTER {CAPACITY | RESERVATION | BI_CAPACITY | DATA_POLICY | CONNECTION}
  //   [IF EXISTS] `path` SET OPTIONS(…)
  // ALTER ORGANIZATION SET OPTIONS(…)      (no object name)
  // ALTER PROJECT project_id SET OPTIONS(…)
  alter_admin_object: $ => seq(
    $.keyword_alter,
    choice(
      $._admin_object_type,
      $.keyword_bi_capacity,
      $.keyword_organization,
      $.keyword_project,
    ),
    optional($._if_exists),
    optional(field('name', $.object_reference)),
    $.keyword_set,
    $.options_clause,
  ),

  // DROP {CAPACITY | RESERVATION | ASSIGNMENT | DATA_POLICY | CONNECTION}
  //   [IF EXISTS] `path`
  drop_admin_object: $ => seq(
    $.keyword_drop,
    $._admin_object_type,
    optional($._if_exists),
    field('name', $.object_reference),
  ),

  _admin_object_type: $ => choice(
    $.keyword_capacity,
    $.keyword_reservation,
    $.keyword_assignment,
    $.keyword_data_policy,
    $.keyword_connection,
  ),

  // UNDROP SCHEMA [IF NOT EXISTS] name [OPTIONS(…)]
  undrop_schema: $ => prec.right(seq(
    $.keyword_undrop,
    $.keyword_schema,
    optional($._if_not_exists),
    field('name', $.object_reference),
    optional($.options_clause),
  )),

  // ALTER SCHEMA [IF EXISTS] name {ADD | DROP} REPLICA name [OPTIONS(…)]
  alter_schema_replica: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_schema,
    optional($._if_exists),
    field('name', $.object_reference),
    choice($.keyword_add, $.keyword_drop),
    $.keyword_replica,
    field('replica', $.identifier),
    optional($.options_clause),
  )),

  // ALTER SEARCH INDEX [IF EXISTS] name ON table action [, …] [REBUILD]
  // ALTER VECTOR INDEX [IF EXISTS] name ON table REBUILD
  alter_search_index: $ => prec.right(seq(
    $.keyword_alter,
    choice($.keyword_search, $.keyword_vector),
    $.keyword_index,
    optional($._if_exists),
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
    optional(comma_list($.search_index_action, true)),
    optional($.keyword_rebuild),
  )),

  search_index_action: $ => choice(
    seq($.keyword_set, $.options_clause),
    seq(
      $.keyword_add,
      $.keyword_column,
      optional($._if_not_exists),
      field('column', $.identifier),
      optional($.options_clause),
    ),
    seq(
      $.keyword_alter,
      $.keyword_column,
      optional($._if_exists),
      field('column', $.identifier),
      $.keyword_set,
      $.options_clause,
    ),
    seq(
      $.keyword_drop,
      $.keyword_column,
      optional($._if_exists),
      field('column', $.identifier),
    ),
  ),

  // DROP {SEARCH | VECTOR} INDEX [IF EXISTS] name ON table
  drop_search_index: $ => seq(
    $.keyword_drop,
    choice($.keyword_search, $.keyword_vector),
    $.keyword_index,
    optional($._if_exists),
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
  ),

  // DROP SNAPSHOT TABLE  | DROP EXTERNAL TABLE | DROP TABLE FUNCTION
  drop_qualified_table: $ => seq(
    $.keyword_drop,
    choice(
      seq(choice($.keyword_snapshot, $.keyword_external), $.keyword_table),
      seq($.keyword_table, $.keyword_function),
    ),
    optional($._if_exists),
    field('name', $.object_reference),
  ),

};
