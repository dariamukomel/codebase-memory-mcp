import { comma_list, paren_list, optional_parenthesis, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // BigQuery function/procedure DDL:
  //   CREATE [TABLE] FUNCTION … AS (expr) | AS SELECT | LANGUAGE js AS '…'
  //   CREATE PROCEDURE … BEGIN … END  (ATOMIC optional)
  create_function: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._temporary),
    optional($.keyword_table),
    // CREATE [OR REPLACE] [TEMP] AGGREGATE FUNCTION …
    optional($.keyword_aggregate),
    $.keyword_function,
    optional($._if_not_exists),
    $.object_reference,
    $.function_arguments,
    optional(seq($.keyword_returns, choice(seq($.keyword_table, optional($.column_definitions)), $._type))),
    repeat(choice($.function_language, $.options_clause)),
    optional($.function_body),
  )),

  function_body: $ => choice(
    seq(
      $.keyword_begin,
      optional($.keyword_atomic),
      repeat1(seq($._function_body_statement, ';')),
      $.keyword_end,
    ),
    seq($.keyword_as, alias($._single_quote_string, $.literal)),
    // SQL UDF: AS (expr); TVF body: AS (SELECT …)
    seq($.keyword_as, wrapped_in_parenthesis(choice($._expression, $._dml_read))),
    // TVF body: AS SELECT … (unparenthesized)
    seq($.keyword_as, $.create_query),
  ),

  procedure_body: $ => seq(
    $.keyword_begin,
    optional($.keyword_atomic),
    repeat(seq($._function_body_statement, ';')),
    $.keyword_end,
  ),

  // Override when_clause to add WHEN NOT MATCHED BY SOURCE (BQ/SQL Server extension)
  when_clause: $ => prec.left(seq(
    $.keyword_when,
    optional($.keyword_not),
    $.keyword_matched,
    optional(seq(
      $.keyword_by,
      $.keyword_source,
    )),
    optional(
      seq(
        $.keyword_and,
        optional_parenthesis(field('predicate', $._expression))
      )
    ),
    $.keyword_then,
    choice(
      $.keyword_delete,
      seq(
        $.keyword_update,
        $._set_values,
      ),
      seq(
        $.keyword_insert,
        $._insert_values
      ),
      optional($.where)
    )
  )),


  // OPTIONS (key = value, ...)
  options_clause: $ => seq(
    $.keyword_options,
    '(',
    comma_list(
      seq(field('key', $.identifier), '=', field('value', $._expression)),
      true,
    ),
    ')',
  ),

  // BigQuery: CREATE [SEARCH | VECTOR] INDEX [IF NOT EXISTS] name
  //   ON tbl {(ALL COLUMNS) | (col, …)} [OPTIONS (…)]
  create_index: $ => seq(
    $.keyword_create,
    optional($.keyword_unique),
    optional(choice($.keyword_search, $.keyword_vector)),
    $.keyword_index,
    optional(
      seq(
        optional($._if_not_exists),
        field('column', $._column),
      ),
    ),
    $.keyword_on,
    optional($.keyword_only),
    seq(
      $.object_reference,
      optional(
        seq(
          $.keyword_using,
          field('index_type', $.identifier),
        ),
      ),
      choice(
        $.index_fields,
        seq('(', $.keyword_all, $.keyword_columns, ')'),
      ),
    ),
    optional($.options_clause),
    optional($.where),
  ),

  // Override: CREATE [TEMP] TABLE ... [column_defs] [PARTITION BY] [CLUSTER BY] [OPTIONS (...)] [AS query]
  create_table: $ => prec.left(
    seq(
      $.keyword_create,
      // BigQuery documents CREATE OR REPLACE TABLE alongside CREATE TABLE;
      // the base (ANSI) rule has no OR REPLACE, so it has to be added here.
      optional($._or_replace),
      optional(
        choice(
          $._temporary,
          $.keyword_unlogged,
          $.keyword_external,
        ),
      ),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      seq(
        optional($.column_definitions),
        optional($.bq_partition_by),
        optional($.bq_cluster_by),
        optional($.options_clause),
        optional(seq($.keyword_as, $.create_query)),
      ),
    ),
  ),

  // PARTITION BY expr
  bq_partition_by: $ => seq(
    $.keyword_partition,
    $.keyword_by,
    $._expression,
  ),

  // CLUSTER BY col1 [, col2, ...]
  bq_cluster_by: $ => seq(
    $.keyword_cluster,
    $.keyword_by,
    comma_list($.identifier, true),
  ),

  // Override: CREATE [OR REPLACE] [TEMP] VIEW ... [OPTIONS (...)] AS query
  create_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace),
      optional($._temporary),
      optional($.keyword_recursive),
      $.keyword_view,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional(paren_list($.identifier)),
      optional($.options_clause),
      $.keyword_as,
      $.create_query,
    ),
  ),

  // CREATE [OR REPLACE] MODEL [IF NOT EXISTS] ref [OPTIONS (...)] AS query
  create_model: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_model,
    optional($._if_not_exists),
    $.object_reference,
    optional($.options_clause),
    $.keyword_as,
    $.create_query,
  ),

  // EXPORT DATA [WITH CONNECTION ref] [OPTIONS (...)] AS query
  export_data: $ => seq(
    $.keyword_export,
    $.keyword_data,
    optional(seq($.keyword_with, $.keyword_connection, $.object_reference)),
    optional($.options_clause),
    $.keyword_as,
    $.create_query,
  ),

  // ASSERT expr [AS 'message']
  assert_statement: $ => seq(
    $.keyword_assert,
    field('condition', $._expression),
    optional(seq($.keyword_as, alias($._literal_string, $.literal))),
  ),

};
