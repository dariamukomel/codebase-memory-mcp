import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// Snowflake Scripting: https://docs.snowflake.com/en/developer-guide/snowflake-scripting/index
//   [DECLARE <declarations>] BEGIN <statements> [EXCEPTION <handlers>] END
export default {

  // :name bind variable (scripting variables inside SQL statements) or :1 (numbered binding).
  // The numbered form is one token so that `[:2]` does not compete with a slice.
  bind_variable: $ => prec(2, choice(seq(':', $.identifier), $.bind_position)),

  bind_position: _ => token(/:[0-9]+/),

  compound_statement: $ => seq(
    optional($.declare_section),
    $.keyword_begin,
    repeat(seq($.statement, ';')),
    optional($.exception_clause),
    $.keyword_end,
    optional($.identifier),
  ),

  declare_section: $ => seq(
    $.keyword_declare,
    repeat1(seq($.declaration, ';')),
  ),

  // name type [DEFAULT | := expr] | name DEFAULT expr | name CURSOR FOR query | name RESULTSET [...]
  //   | name EXCEPTION [(code, 'message')] | name PROCEDURE (...) RETURNS type AS <block>
  declaration: $ => choice(
    seq($.identifier, $.keyword_cursor, $.keyword_for, choice($._dml_read, $.identifier)),
    seq($.identifier, $.keyword_resultset, optional(seq(choice($.keyword_default, ':='), $._resultset_source))),
    seq($.identifier, $.keyword_exception, optional(paren_list($._expression, true))),
    seq($.identifier, $.keyword_procedure, $.routine_arguments, $.routine_returns, $.keyword_as, $.compound_statement),
    seq($.identifier, optional($._type), optional(seq(choice($.keyword_default, ':='), $._expression))),
  ),

  _resultset_source: $ => choice(
    wrapped_in_parenthesis($._dml_read),
    seq($.keyword_async, wrapped_in_parenthesis($._dml_read)),
    wrapped_in_parenthesis($.execute_immediate_statement),
  ),

  // <var> := <expr> | (<query>) | (EXECUTE IMMEDIATE ...)
  assignment_statement: $ => seq($.identifier, ':=', choice($._expression, seq($.keyword_async, wrapped_in_parenthesis($._dml_read)), wrapped_in_parenthesis($.execute_immediate_statement))),

  // LET var [type] { := | DEFAULT } expr | LET c CURSOR FOR query | LET res RESULTSET { := | DEFAULT } (query)
  let_statement: $ => seq(
    $.keyword_let,
    $.identifier,
    choice(
      seq($.keyword_cursor, $.keyword_for, choice($._dml_read, $.identifier)),
      seq($.keyword_resultset, choice($.keyword_default, ':='), $._resultset_source),
      seq(optional($._type), choice($.keyword_default, ':='), $._expression),
    ),
  ),

  if_statement: $ => seq(
    $.keyword_if, $._expression, $.keyword_then,
    repeat(seq($.statement, ';')),
    repeat(seq($.keyword_elseif, $._expression, $.keyword_then, repeat(seq($.statement, ';')))),
    optional(seq($.keyword_else, repeat(seq($.statement, ';')))),
    $.keyword_end, $.keyword_if,
  ),

  case_statement: $ => seq(
    $.keyword_case,
    optional($._expression),
    repeat1(seq($.keyword_when, $._expression, $.keyword_then, repeat(seq($.statement, ';')))),
    optional(seq($.keyword_else, repeat(seq($.statement, ';')))),
    $.keyword_end,
    optional($.keyword_case),
  ),

  // WHILE cond { DO | LOOP } ... END { WHILE | LOOP } [label]
  while_statement: $ => seq(
    $.keyword_while, $._expression, choice($.keyword_do, $.keyword_loop),
    repeat(seq($.statement, ';')),
    $.keyword_end, choice($.keyword_while, $.keyword_loop), optional($.identifier),
  ),

  // FOR i IN [REVERSE] a TO b { DO | LOOP } ... | FOR rec IN <cursor or resultset> { DO | LOOP } ...
  for_statement: $ => seq(
    $.keyword_for,
    field('variable', $.identifier),
    $.keyword_in,
    optional($.keyword_reverse),
    $._expression,
    optional(seq($.keyword_to, $._expression)),
    choice($.keyword_do, $.keyword_loop),
    repeat(seq($.statement, ';')),
    $.keyword_end, choice($.keyword_for, $.keyword_loop), optional($.identifier),
  ),

  repeat_statement: $ => seq(
    $.keyword_repeat,
    repeat(seq($.statement, ';')),
    $.keyword_until, $._expression,
    $.keyword_end, $.keyword_repeat, optional($.identifier),
  ),

  loop_statement: $ => seq(
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end, $.keyword_loop, optional($.identifier),
  ),

  break_statement: $ => seq(choice($.keyword_break, $.keyword_exit), optional($.identifier)),

  continue_statement: $ => seq(choice($.keyword_continue, $.keyword_iterate), optional($.identifier)),

  null_statement: $ => $.keyword_null,

  raise_statement: $ => seq($.keyword_raise, optional($.identifier)),

  // RETURN [<expr> | TABLE ( <resultset> )]
  return_statement: $ => seq(
    $.keyword_return,
    optional(choice(
      seq($.keyword_table, '(', $._expression, ')'),
      $._expression,
    )),
  ),

  open_statement: $ => seq(
    $.keyword_open, $.identifier,
    optional(seq($.keyword_using, paren_list($._expression, true))),
  ),

  fetch_statement: $ => seq(
    $.keyword_fetch, $.identifier, $.keyword_into, comma_list(choice($.identifier, $.bind_variable), true),
  ),

  close_statement: $ => seq($.keyword_close, $.identifier),

  async_statement: $ => seq($.keyword_async, wrapped_in_parenthesis($.statement)),

  await_statement: $ => seq($.keyword_await, choice($.keyword_all, $.identifier)),

  cancel_statement: $ => seq($.keyword_cancel, $.identifier),

  // EXCEPTION WHEN { OTHER | name [OR name ...] } [CONTINUE | EXIT] THEN <statements>
  exception_clause: $ => seq(
    $.keyword_exception,
    repeat1($.when_handler),
  ),

  when_handler: $ => seq(
    $.keyword_when,
    choice($.keyword_other, seq($.identifier, repeat(seq($.keyword_or, $.identifier)))),
    optional(choice($.keyword_continue, $.keyword_exit)),
    $.keyword_then,
    repeat(seq($.statement, ';')),
  ),

};
