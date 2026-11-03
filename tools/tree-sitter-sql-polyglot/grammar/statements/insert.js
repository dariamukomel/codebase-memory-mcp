import { comma_list } from "../helpers.js";

// <insert statement> ::= INSERT INTO <table> { [ (cols) ] VALUES rows | [ (cols) ] <query> | DEFAULT VALUES }
// ON CONFLICT, ON DUPLICATE KEY UPDATE, INSERT ... SET and an optional INTO are vendor syntax and live in
// each dialect's grammar/legacy_statements.js.
export default {

  _insert_statement: $ => seq(
    $.insert,
  ),

  insert: $ => seq(
    $.keyword_insert,
    $.keyword_into,
    field('target', $.object_reference),
    choice(
      $._insert_values,
      seq($.keyword_default, $.keyword_values),
    ),
  ),

  assignment: $ => seq(
    field('left',
      alias(
        $._qualified_field,
        $.field,
      ),
    ),
    '=',
    field('right', $._expression),
  ),

  _insert_values: $ => seq(
    optional(alias($._column_list, $.list)),
    choice(
      seq(
        $.keyword_values,
        comma_list($.list, true),
      ),
      $._dml_read,
    ),
  ),

  // <set clause list> ::= <set clause> [ , ... ]
  _set_values: $ => seq(
    $.keyword_set,
    comma_list($.assignment, true),
  ),

}
