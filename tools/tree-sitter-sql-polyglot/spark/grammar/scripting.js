import { optional_parenthesis, comma_list, paren_list } from "../../grammar/helpers.js";

export default {

  // Spark SQL 3.4+ top-level BEGIN/END block
  block: $ => seq(
    $.keyword_begin,
    optional(seq($.keyword_atomic)),
    repeat(
      seq(
        $.statement,
        ';',
      ),
    ),
    $.keyword_end,
  ),

  // IF condition THEN statements [ELSEIF ...] [ELSE ...] END IF
  if_statement: $ => seq(
    $.keyword_if,
    $._expression,
    $.keyword_then,
    repeat(seq($.statement, ';')),
    optional(seq(
      $.keyword_elseif,
      $._expression,
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

  // FOR var IN query DO statements END FOR
  for_statement: $ => seq(
    $.keyword_for,
    field('variable', $.identifier),
    $.keyword_in,
    $._dml_read,
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_for,
  ),

  // WHILE condition DO statements END WHILE
  while_statement: $ => seq(
    $.keyword_while,
    optional_parenthesis($._expression),
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_while,
  ),

  // [label:] LOOP ... END LOOP [label]
  loop_statement: $ => seq(
    optional(seq(field('label', $.identifier), ':')),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
  ),

  // REPEAT ... UNTIL condition END REPEAT
  repeat_statement: $ => seq(
    $.keyword_repeat,
    repeat(seq($.statement, ';')),
    $.keyword_until,
    $._expression,
    $.keyword_end,
    $.keyword_repeat,
  ),

  // LEAVE label (exit a loop or block)
  leave_statement: $ => seq(
    $.keyword_leave,
    field('label', $.identifier),
  ),

  // ITERATE label (continue to next iteration)
  iterate_statement: $ => seq(
    $.keyword_iterate,
    field('label', $.identifier),
  ),

  // SIGNAL [SQLSTATE 'value'] [SET MESSAGE_TEXT = 'msg']
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

  // GET DIAGNOSTICS variable = RETURNED_SQLSTATE | MESSAGE_TEXT | ...
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
};