import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// ALTER TABLE actions Snowflake documents beyond the shared ones:
// https://docs.snowflake.com/en/sql-reference/sql/alter-table
// https://docs.snowflake.com/en/sql-reference/sql/alter-table-column
// Actions are comma-separated by the shared alter_table rule.
export default {

  // ADD [CONSTRAINT name] { UNIQUE | PRIMARY KEY | FOREIGN KEY ... } (cols) [properties]
  add_constraint: $ => seq($.keyword_add, $.table_constraint),

  // DROP CONSTRAINT name | DROP { PRIMARY KEY | UNIQUE | FOREIGN KEY } [(cols)] [CASCADE | RESTRICT]
  drop_constraint: $ => seq(
    $.keyword_drop,
    choice(
      seq($.keyword_constraint, optional($._if_exists), $.identifier),
      seq($.keyword_primary, $.keyword_key),
      $.keyword_unique,
      seq($.keyword_foreign, $.keyword_key),
    ),
    optional(paren_list($.identifier, true)),
    optional($._drop_behavior),
  ),

  // ALTER CONSTRAINT name [(cols)] properties
  alter_constraint: $ => seq(
    $.keyword_alter,
    $.keyword_constraint,
    $.identifier,
    optional(paren_list($.identifier, true)),
    repeat1($._constraint_property),
  ),

  // MODIFY { PRIMARY KEY | UNIQUE | FOREIGN KEY } (cols) properties
  modify_constraint: $ => seq(
    $.keyword_modify,
    choice(
      seq($.keyword_primary, $.keyword_key),
      $.keyword_unique,
      seq($.keyword_foreign, $.keyword_key),
    ),
    paren_list($.identifier, true),
    repeat1($._constraint_property),
  ),

  rename_constraint: $ => seq(
    $.keyword_rename,
    $.keyword_constraint,
    $.identifier,
    $.keyword_to,
    $.identifier,
  ),

  // ALTER | MODIFY [COLUMN] col action [, [COLUMN] col action ...], or ALTER ( col action, ... ).
  // The comma-separated form is part of this rule (not a free-standing action) so a column name after
  // the comma cannot be mistaken for the start of an ADD-less column definition.
  alter_column: $ => prec.right(seq(
    choice($.keyword_alter, $.keyword_modify),
    choice(
      seq($.column_alteration, repeat(choice(
        seq(',', $.column_alteration),
        // ", COLUMN d ..." is one token: after a SET TAG list a plain ',' would be ambiguous between the
        // next tag and the next column
        seq(alias($._comma_column, ','), alias($._column_alteration_body, $.column_alteration)),
      ))),
      paren_list($.column_alteration, true),
    ),
  )),

  _comma_column: _ => token(/,\s*[Cc][Oo][Ll][Uu][Mm][Nn]\s+/),

  column_alteration: $ => seq(
    optional($.keyword_column),
    $._column_alteration_body,
  ),

  _column_alteration_body: $ => seq(
    field('name', $.identifier),
    $._column_action,
  ),

  _column_action: $ => prec.right(choice(
    seq(choice($.keyword_set, $.keyword_drop), $.keyword_not, $.keyword_null),
    seq(optional($.keyword_not), $.keyword_null),
    seq(optional(seq($.keyword_set, $.keyword_data)), $.keyword_type, field('type', $._type), optional(seq($.keyword_rename, $.keyword_fields))),
    field('type', $._type),
    seq($.keyword_set, $.keyword_default, $._expression),
    seq($.keyword_set, $.keyword_write, $.keyword_default, $._expression),
    seq($.keyword_drop, $.keyword_default),
    seq($.keyword_comment, alias($._literal_string, $.literal)),
    seq($.keyword_unset, $.keyword_comment),
    seq(
      $.keyword_set, $.keyword_masking, $.keyword_policy, $.object_reference,
      optional(seq($.keyword_using, paren_list($._expression, true))),
      optional($.keyword_force),
    ),
    seq($.keyword_unset, $.keyword_masking, $.keyword_policy),
    seq($.keyword_set, $.keyword_projection, $.keyword_policy, $.object_reference, optional($.keyword_force)),
    seq($.keyword_unset, $.keyword_projection, $.keyword_policy),
    seq($.keyword_set, $.keyword_tag, comma_list($.tag_assignment, true)),
    seq($.keyword_unset, $.keyword_tag, comma_list($.object_reference, true)),
  )),

  tag_assignment: $ => seq($.object_reference, '=', $.literal),

  // Table-level actions that take no column.
  snowflake_table_action: $ => prec.right(choice(
    seq($.keyword_set, $.keyword_tag, comma_list($.tag_assignment, true)),
    seq($.keyword_unset, $.keyword_tag, comma_list($.object_reference, true)),

    // [ADD | DROP] ROW ACCESS POLICY
    seq($.keyword_add, $.keyword_row, $.keyword_access, $.keyword_policy, $.object_reference, $.keyword_on, paren_list($.identifier, true)),
    seq($.keyword_drop, $.keyword_row, $.keyword_access, $.keyword_policy, $.object_reference),
    seq($.keyword_drop, $.keyword_all, $.keyword_row, $.keyword_access, $.keyword_policies),

    seq($.keyword_add, $.keyword_storage, $.keyword_lifecycle, $.keyword_policy, $.object_reference, $.keyword_on, paren_list($.identifier, true)),
    seq($.keyword_drop, $.keyword_storage, $.keyword_lifecycle, $.keyword_policy),

    // SET / UNSET AGGREGATION | JOIN POLICY
    seq($.keyword_set, $.keyword_aggregation, $.keyword_policy, $.object_reference,
      optional(seq($.keyword_entity, $.keyword_key, paren_list($.identifier, true))), optional($.keyword_force)),
    seq($.keyword_unset, $.keyword_aggregation, $.keyword_policy),
    seq($.keyword_set, $.keyword_join, $.keyword_policy, $.object_reference,
      optional(seq($.keyword_allowed, $.keyword_join, $.keyword_keys, paren_list($.identifier, true))), optional($.keyword_force)),
    seq($.keyword_unset, $.keyword_join, $.keyword_policy),

    // SET CONTACT purpose = contact | UNSET CONTACT purpose
    seq($.keyword_set, $.keyword_contact, comma_list(seq($.identifier, '=', $.identifier), true)),
    seq($.keyword_unset, $.keyword_contact, comma_list($.identifier, true)),

    // ADD | DROP SEARCH OPTIMIZATION [ON method(cols), ...]
    seq($.keyword_add, $.keyword_search, $.keyword_optimization, optional(seq($.keyword_on, comma_list($.search_optimization_method, true)))),
    seq($.keyword_drop, $.keyword_search, $.keyword_optimization, optional(seq($.keyword_on, comma_list($.search_optimization_method, true)))),

    // ADD | DROP | MODIFY DATA METRIC FUNCTION fn ON (cols) ...
    seq($.keyword_add, $.keyword_data, $.keyword_metric, $.keyword_function, $.object_reference, $.keyword_on, $._dmf_arguments, repeat($._dmf_option)),
    seq($.keyword_drop, $.keyword_data, $.keyword_metric, $.keyword_function, $.object_reference, $.keyword_on, $._dmf_arguments),
    seq($.keyword_modify, $.keyword_data, $.keyword_metric, $.keyword_function, $.object_reference, $.keyword_on, $._dmf_arguments, choice(
      $.keyword_suspend,
      $.keyword_resume,
      seq($.keyword_add, $.keyword_expectation, $.identifier, wrapped_in_parenthesis($._expression)),
      seq($.keyword_drop, $.keyword_expectation, $.identifier),
    )),

    seq($.keyword_swap, $.keyword_with, $.object_reference),
    seq($.keyword_recluster, optional($.snowflake_property), optional($.where)),
  )),

  // (col, TABLE other(col), ...)
  _dmf_arguments: $ => paren_list(
    choice(
      seq($.keyword_table, $.object_reference, paren_list($.identifier, true)),
      $.identifier,
    ),
    true,
  ),

  _dmf_option: $ => choice(
    seq($.keyword_within, $.keyword_group, paren_list($.identifier, true)),
    seq($.keyword_group, $.keyword_limit, alias($._integer, $.literal)),
    seq($.keyword_filter, wrapped_in_parenthesis($._expression)),
    seq($.keyword_expectation, $.identifier, wrapped_in_parenthesis($._expression)),
    seq($.keyword_execute, $.keyword_as, $.keyword_role, $.identifier),
    $.snowflake_property,
  ),

  // EQUALITY(c1, c2) | SUBSTRING(c3) | GEO(c4) | FULL_TEXT(*)
  search_optimization_method: $ => seq(
    $.identifier,
    paren_list(choice($.identifier, '*'), true),
  ),

};
