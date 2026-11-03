import { comma_list } from '../../grammar/helpers.js';

export default {

  // target := expression
  assignment_statement: $ => seq(
    field('target', choice($.identifier, $._qualified_field)),
    ':=',
    field('value', $._expression),
  ),

  // IF cond THEN ... [ELSIF cond THEN ...] [ELSE ...] END IF
  if_statement: $ => seq(
    $.keyword_if,
    field('condition', $._expression),
    $.keyword_then,
    repeat(seq($.statement, ';')),
    repeat(seq(
      $.keyword_elsif,
      field('condition', $._expression),
      $.keyword_then,
      repeat(seq($.statement, ';')),
    )),
    optional(seq(
      $.keyword_else,
      repeat(seq($.statement, ';')),
    )),
    $.keyword_end,
    $.keyword_if,
  ),

  // WHILE condition LOOP ... END LOOP
  while_statement: $ => seq(
    $.keyword_while,
    field('condition', $._expression),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
  ),

  // LOOP ... END LOOP (infinite / EXIT-controlled)
  loop_statement: $ => seq(
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
  ),

  // FOR i IN lower..upper [REVERSE] LOOP ... END LOOP
  for_statement: $ => seq(
    $.keyword_for,
    field('index', $.identifier),
    $.keyword_in,
    optional($.keyword_reverse),
    field('lower', $._expression),
    '..',
    field('upper', $._expression),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
  ),

  // RETURN [expression]
  return_statement: $ => seq(
    $.keyword_return,
    optional($._expression),
  ),

  // EXIT [WHEN condition]
  exit_statement: $ => seq(
    $.keyword_exit,
    optional(seq($.keyword_when, field('condition', $._expression))),
  ),

  // CONTINUE [WHEN condition]
  continue_statement: $ => seq(
    $.keyword_continue,
    optional(seq($.keyword_when, field('condition', $._expression))),
  ),

  // NULL (no-op statement)
  null_statement: $ => $.keyword_null,

  // PRAGMA identifier [(args)]   -- generic: covers EXCEPTION_INIT, AUTONOMOUS_TRANSACTION, etc.
  pragma_statement: $ => seq(
    $.keyword_pragma,
    $.identifier,
    optional(seq('(', comma_list($._expression, true), ')')),
  ),

  // PIPE ROW (expr)
  pipe_row_statement: $ => seq(
    $.keyword_pipe,
    $.keyword_row,
    '(',
    $._expression,
    ')',
  ),

  // RETURNING expr [, expr] [BULK COLLECT] INTO identifier [, identifier]
  returning_into_clause: $ => seq(
    $.keyword_returning,
    comma_list($._expression, true),
    optional(seq($.keyword_bulk, $.keyword_collect)),
    $.keyword_into,
    comma_list($.identifier, true),
  ),

};
