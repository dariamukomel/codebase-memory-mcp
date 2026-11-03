import { comma_list, paren_list } from '../../grammar/helpers.js';

// CREATE VIEW / FUNCTION / PROCEDURE as Snowflake documents them:
// https://docs.snowflake.com/en/sql-reference/sql/create-view
// https://docs.snowflake.com/en/sql-reference/sql/create-function
// https://docs.snowflake.com/en/sql-reference/sql/create-procedure
// Option lists are repeated choices because Snowflake accepts them in any order.
export default {

  _or_replace_or_alter: $ => choice($._or_replace, seq($.keyword_or, $.keyword_alter)),

  create_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace_or_alter),
      optional($.keyword_secure),
      optional(choice(
        seq(optional(choice($.keyword_local, $.keyword_global)), $._temporary),
        $.keyword_volatile,
      )),
      optional($.keyword_recursive),
      $.keyword_view,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional(paren_list($.view_column, true)),
      repeat($._snowflake_view_clause),
      $.keyword_as,
      $.create_query,
    ),
  ),

  // <column> [COMMENT '...'] [WITH] MASKING POLICY p [USING (...)] | PROJECTION POLICY p | TAG (...)
  view_column: $ => seq(
    $.identifier,
    repeat(choice(
      seq($.keyword_comment, alias($._literal_string, $.literal)),
      seq(
        optional($.keyword_with),
        $.keyword_masking,
        $.keyword_policy,
        $.object_reference,
        optional(seq($.keyword_using, paren_list($.identifier, true))),
      ),
      seq(optional($.keyword_with), $.keyword_projection, $.keyword_policy, $.object_reference),
      $.tag_clause,
    )),
  ),

  _snowflake_view_clause: $ => choice(
    seq($.keyword_copy, choice($.keyword_grants, $.keyword_tags)),
    $.tag_clause,
    $.row_access_policy_clause,
    $.aggregation_policy_clause,
    $.join_policy_clause,
    $.contact_clause,
    seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
    $.snowflake_property,
  ),

  create_function: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace_or_alter),
      optional($._temporary),
      optional($.keyword_secure),
      optional($.keyword_aggregate),
      optional($.keyword_external),
      optional(seq($.keyword_data, $.keyword_metric)),
      $.keyword_function,
      optional($._if_not_exists),
      $.object_reference,
      $.routine_arguments,
      repeat($._snowflake_routine_clause),
      $.routine_returns,
      repeat($._snowflake_routine_clause),
      optional($.routine_body),
    ),
  ),

  create_procedure: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace_or_alter),
      optional($._temporary),
      optional($.keyword_secure),
      $.keyword_procedure,
      optional($._if_not_exists),
      $.object_reference,
      $.routine_arguments,
      repeat($._snowflake_routine_clause),
      $.routine_returns,
      repeat($._snowflake_routine_clause),
      optional($.routine_body),
    ),
  ),

  routine_arguments: $ => paren_list($.routine_argument, false),

  _argument_mode: $ => choice($.keyword_in, $.keyword_out, $.keyword_inout, $.keyword_input, $.keyword_output),

  // name [IN | OUT | INPUT | OUTPUT] type [DEFAULT expr]   (the mode may also lead the name)
  routine_argument: $ => seq(
    optional($._argument_mode),
    $.identifier,
    optional($._argument_mode),
    choice($._type, seq($.keyword_table, '(', comma_list($.column_definition, true), ')')),
    optional(seq($.keyword_default, $._expression)),
  ),

  // RETURNS { <type> [NOT NULL] | TABLE ( [<col> <type>, ...] ) }
  routine_returns: $ => seq(
    $.keyword_returns,
    choice(
      seq($._type, optional(seq($.keyword_not, $.keyword_null))),
      seq($.keyword_table, '(', optional(comma_list($.column_definition, true)), ')'),
    ),
  ),

  _snowflake_routine_clause: $ => choice(
    seq($.keyword_language, $.identifier),
    seq($.keyword_called, $.keyword_on, $.keyword_null, $.keyword_input),
    seq($.keyword_returns, $.keyword_null, $.keyword_on, $.keyword_null, $.keyword_input),
    $.keyword_strict,
    $.keyword_immutable,
    $.keyword_volatile,
    $.keyword_memoizable,
    $.keyword_null,
    seq($.keyword_execute, $.keyword_as, choice(
      $.keyword_owner,
      $.keyword_caller,
      seq($.keyword_restricted, $.keyword_caller),
    )),
    seq($.keyword_copy, $.keyword_grants),
    seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
    $.snowflake_property,
  ),

  // AS '<definition>' | AS $$<definition>$$ | AS BEGIN ... END
  routine_body: $ => seq(
    $.keyword_as,
    choice(
      alias($._literal_string, $.literal),
      $.compound_statement,
    ),
  ),

  create_schema: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($.keyword_transient),
    $.keyword_schema,
    optional($._if_not_exists),
    $.object_reference,
    repeat(choice(
      $.clone_clause,
      $.backup_set_clause,
      seq($.keyword_with, $.keyword_managed, $.keyword_access),
      $.tag_clause,
      $.contact_clause,
      seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
      $.snowflake_property,
    )),
  )),

  create_database: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($.keyword_transient),
    $.keyword_database,
    optional($._if_not_exists),
    $.identifier,
    repeat(choice(
      $.clone_clause,
      $.tag_clause,
      seq($.keyword_as, $.keyword_replica, $.keyword_of, $.object_reference),
      seq($.keyword_from, $.keyword_listing, alias($._literal_string, $.literal)),
      seq($.keyword_from, $.keyword_share, $.object_reference),
      $.contact_clause,
      $.backup_set_clause,
      $.snowflake_property,
    )),
  )),

  create_role: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_role,
    optional($._if_not_exists),
    $.identifier,
    repeat(choice($.tag_clause, $.snowflake_property)),
  ),

  // CREATE [OR REPLACE | OR ALTER] TAG [IF NOT EXISTS] name [ALLOWED_VALUES 'v' [, ...]] [COMMENT = '...']
  create_tag: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_tag,
    optional($._if_not_exists),
    $.object_reference,
    repeat(choice(
      seq($.keyword_allowed_values, comma_list(alias($._literal_string, $.literal), true)),
      seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
      $.snowflake_property,
    )),
  ),

};
