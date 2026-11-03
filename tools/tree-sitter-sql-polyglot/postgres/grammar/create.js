import { paren_list, comma_list } from "../../grammar/helpers.js";

export default {

  // CREATE CAST (source AS target) {WITH FUNCTION f | WITHOUT FUNCTION | WITH INOUT}
  //   [AS ASSIGNMENT | AS IMPLICIT]
  create_cast: $ => seq(
    $.keyword_create,
    $.keyword_cast,
    '(',
    $._type,
    $.keyword_as,
    $._type,
    ')',
    choice(
      seq($.keyword_with, $.keyword_function, $.object_reference, optional($.function_arguments)),
      seq($.keyword_without, $.keyword_function),
      seq($.keyword_with, $.keyword_inout),
    ),
    optional(seq($.keyword_as, choice($.keyword_assignment, $.keyword_implicit))),
  ),

  // CREATE DOMAIN name [AS] type [DEFAULT expr] [ [CONSTRAINT c] {NULL|NOT NULL|CHECK(expr)} … ]
  create_domain: $ => seq(
    $.keyword_create,
    $.keyword_domain,
    $.object_reference,
    optional($.keyword_as),
    $._type,
    repeat(choice(
      $._default_expression,
      $.keyword_null,
      $._not_null,
      $._check_constraint,
    )),
  ),

  // Foreign-data wrapper DDL.
  fdw_options: $ => seq(
    $.keyword_options,
    '(',
    comma_list(seq($.identifier, alias($._literal_string, $.literal)), true),
    ')',
  ),

  create_server: $ => seq(
    $.keyword_create,
    $.keyword_server,
    optional($._if_not_exists),
    $.identifier,
    optional(seq($.keyword_type, alias($._literal_string, $.literal))),
    optional(seq($.keyword_version, choice(alias($._literal_string, $.literal), $.identifier))),
    $.keyword_foreign,
    $.keyword_data,
    $.keyword_wrapper,
    $.identifier,
    optional($.fdw_options),
  ),

  create_foreign_table: $ => seq(
    $.keyword_create,
    $.keyword_foreign,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    $.keyword_server,
    $.identifier,
    optional($.fdw_options),
  ),

  create_extension: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_extension,
    optional($._if_not_exists),
    $.identifier,
    optional($.keyword_with),
    optional(seq($.keyword_schema, $.identifier)),
    optional(seq($.keyword_version, choice($.identifier, alias($._literal_string, $.literal)))),
    optional($.keyword_cascade),
  )),

  // Postgres row level security
  create_policy: $ => prec.right(
    seq(
      $.keyword_create,
      $.keyword_policy,
      $.object_reference,
      $.keyword_on,
      $.object_reference,
      optional(
        seq(
          $.keyword_as,
          choice(
            $.keyword_permissive,
            $.keyword_restrictive,
          ),
        ),
      ),
      optional(
        seq(
          $.keyword_for,
          choice(
            $.keyword_all,
            $.keyword_select,
            $.keyword_insert,
            $.keyword_update,
            $.keyword_delete,
          ),
        ),
      ),
      optional(
        seq(
          $.keyword_to,
          choice(
            $.object_reference,
            $.keyword_public,
            $.keyword_current_role,
            $.keyword_current_user,
            $.keyword_session_user,
          ),
          repeat(
            seq(
              ',',
              choice(
                $.object_reference,
                $.keyword_public,
                $.keyword_current_role,
                $.keyword_current_user,
                $.keyword_session_user,
              ),
            ),
          ),
        ),
      ),
      optional(
        seq(
          $.keyword_using,
          $.parenthesized_expression,
        ),
      ),
      optional(
        seq(
          $.keyword_with,
          $.keyword_check,
          $.parenthesized_expression,
        ),
      ),
    ),
  ),

  // CREATE [OR REPLACE] AGGREGATE name ( [* | arg_types [ORDER BY direct_types]] )
  //   ( option = value [, ...] )
  create_aggregate_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_aggregate,
    $.object_reference,
    '(',
    choice(
      '*',
      seq(
        comma_list($._type, true),
        optional(seq($.keyword_order, $.keyword_by, comma_list($._type, true))),
      ),
    ),
    ')',
    '(',
    comma_list($.aggregate_option, true),
    ')',
  ),

  // key = value  (covers SFUNC, STYPE, INITCOND, PARALLEL, etc.)
  // bare identifier covers flags like FINALFUNC_EXTRA
  aggregate_option: $ => choice(
    seq($.identifier, '=', $._expression),
    $.identifier,
  ),

};
