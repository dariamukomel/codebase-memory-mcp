import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // [label:] BEGIN statement* END [label]
  // DECLARE statements appear as regular statements (must precede others semantically,
  // but the grammar does not enforce ordering)
  compound_statement: $ => seq(
    optional(seq(field('label', $.identifier), ':')),
    $.keyword_begin,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    optional(field('end_label', $.identifier)),
  ),

  // DECLARE var_name type [DEFAULT expr]
  declare_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    field('type', $._type),
    optional(seq($.keyword_default, field('default', $._expression))),
  ),

  // SET var = expr  (plain identifiers, qualified fields like NEW.col, @user_variables)
  set_variable_statement: $ => seq(
    $.keyword_set,
    choice(
      $.user_variable,
      alias($._qualified_field, $.field),
      $.identifier,
    ),
    '=',
    field('value', $._expression),
  ),

  // IF cond THEN ... [ELSEIF cond THEN ...] [ELSE ...] END IF
  if_statement: $ => seq(
    $.keyword_if,
    field('condition', $._expression),
    $.keyword_then,
    repeat(seq($.statement, ';')),
    repeat(seq(
      $.keyword_elseif,
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

  // WHILE cond DO ... END WHILE
  while_statement: $ => seq(
    $.keyword_while,
    field('condition', $._expression),
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_while,
  ),

  // REPEAT ... UNTIL cond END REPEAT
  repeat_statement: $ => seq(
    $.keyword_repeat,
    repeat(seq($.statement, ';')),
    $.keyword_until,
    field('condition', $._expression),
    $.keyword_end,
    $.keyword_repeat,
  ),

  // [label:] LOOP ... END LOOP [label]
  loop_statement: $ => seq(
    optional(seq(field('label', $.identifier), ':')),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
    optional(field('end_label', $.identifier)),
  ),

  // LEAVE label
  leave_statement: $ => seq(
    $.keyword_leave,
    field('label', $.identifier),
  ),

  // ITERATE label
  iterate_statement: $ => seq(
    $.keyword_iterate,
    field('label', $.identifier),
  ),

  // RETURN expr
  return_statement: $ => seq(
    $.keyword_return,
    $._expression,
  ),

  // CALL proc_name(args)
  call_statement: $ => seq(
    $.keyword_call,
    $.invocation,
  ),

  // SIGNAL SQLSTATE 'value' [SET MESSAGE_TEXT = 'msg']
  signal_statement: $ => prec.right(seq(
    $.keyword_signal,
    optional(seq(
      $.keyword_sqlstate,
      alias($._single_quote_string, $.literal),
    )),
    optional(seq(
      $.keyword_set,
      $.keyword_message_text,
      '=',
      alias($._single_quote_string, $.literal),
    )),
  )),

  // RESIGNAL [SQLSTATE 'value'] [SET MESSAGE_TEXT = 'msg']
  resignal_statement: $ => prec.right(seq(
    $.keyword_resignal,
    optional(seq(
      $.keyword_sqlstate,
      alias($._single_quote_string, $.literal),
    )),
    optional(seq(
      $.keyword_set,
      $.keyword_message_text,
      '=',
      alias($._single_quote_string, $.literal),
    )),
  )),

  // GET DIAGNOSTICS variable = RETURNED_SQLSTATE | MESSAGE_TEXT | CONDITION n
  get_diagnostics_statement: $ => seq(
    $.keyword_get,
    $.keyword_diagnostics,
    field('variable', $.identifier),
    '=',
    choice(
      $.keyword_returned_sqlstate,
      $.keyword_message_text,
      seq($.keyword_condition, field('condition_number', alias($._integer, $.literal))),
    ),
  ),

  // DECLARE cur CURSOR FOR select_statement
  declare_cursor_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    $.keyword_cursor,
    $.keyword_for,
    $._dml_read,
  ),

  // OPEN cursor_name
  open_cursor_statement: $ => seq(
    $.keyword_open,
    field('name', $.identifier),
  ),

  // FETCH cursor_name INTO var [, var ...]
  fetch_cursor_statement: $ => seq(
    $.keyword_fetch,
    field('name', $.identifier),
    $.keyword_into,
    comma_list(choice($.user_variable, $.identifier), true),
  ),

  // CLOSE cursor_name
  close_cursor_statement: $ => seq(
    $.keyword_close,
    field('name', $.identifier),
  ),

  // DECLARE name CONDITION FOR SQLSTATE 'value'
  declare_condition_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    $.keyword_condition,
    $.keyword_for,
    $.keyword_sqlstate,
    alias($._single_quote_string, $.literal),
  ),

  // DECLARE CONTINUE|EXIT HANDLER FOR condition_list stmt_or_block
  declare_handler_statement: $ => seq(
    $.keyword_declare,
    field('action', choice($.keyword_continue, $.keyword_exit)),
    $.keyword_handler,
    $.keyword_for,
    comma_list($.handler_condition, true),
    choice(
      $.compound_statement,
      seq($.statement, ';'),
    ),
  ),

  // NOT FOUND | SQLEXCEPTION | SQLWARNING | SQLSTATE 'value' | condition_name
  handler_condition: $ => choice(
    seq($.keyword_not, $.keyword_found),
    $.keyword_sqlexception,
    $.keyword_sqlwarning,
    seq($.keyword_sqlstate, alias($._single_quote_string, $.literal)),
    $.identifier,
  ),

  // CASE expr WHEN v THEN stmts [WHEN ...] [ELSE stmts] END CASE
  // CASE WHEN cond THEN stmts [WHEN ...] [ELSE stmts] END CASE
  case_statement: $ => choice(
    seq(
      $.keyword_case,
      field('operand', $._expression),
      repeat1(seq(
        $.keyword_when,
        field('condition', $._expression),
        $.keyword_then,
        repeat(seq($.statement, ';')),
      )),
      optional(seq(
        $.keyword_else,
        repeat(seq($.statement, ';')),
      )),
      $.keyword_end,
      $.keyword_case,
    ),
    seq(
      $.keyword_case,
      repeat1(seq(
        $.keyword_when,
        field('condition', $._expression),
        $.keyword_then,
        repeat(seq($.statement, ';')),
      )),
      optional(seq(
        $.keyword_else,
        repeat(seq($.statement, ';')),
      )),
      $.keyword_end,
      $.keyword_case,
    ),
  ),

};
