import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // DECLARE x [, y] [TYPE] [DEFAULT expr];
  declare_statement: $ => seq(
    $.keyword_declare,
    comma_list($.identifier, true),
    optional($._type),
    optional(seq($.keyword_default, $._expression)),
  ),

  // SET x = expr;  or  SET (x, y) = (e1, e2);
  set_variable_statement: $ => seq(
    $.keyword_set,
    choice(
      seq($.identifier, '=', $._expression),
      seq(
        paren_list($.identifier, true),
        '=',
        paren_list($._expression, true),
      ),
    ),
  ),

  // BEGIN [stmts] [EXCEPTION WHEN ERROR THEN stmts] END
  compound_statement: $ => seq(
    $.keyword_begin,
    repeat(seq($.statement, ';')),
    optional($.exception_clause),
    $.keyword_end,
  ),

  // EXCEPTION WHEN ERROR THEN stmts
  exception_clause: $ => seq(
    $.keyword_exception,
    $.keyword_when,
    $.keyword_error,
    $.keyword_then,
    repeat(seq($.statement, ';')),
  ),

  // FOR r IN (SELECT ...) DO stmts END FOR
  for_statement: $ => seq(
    $.keyword_for,
    field('variable', $.identifier),
    $.keyword_in,
    $.subquery,
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_for,
  ),

  // WHILE expr DO stmts END WHILE
  while_statement: $ => seq(
    $.keyword_while,
    field('condition', $._expression),
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_while,
  ),

  // LOOP stmts END LOOP
  loop_statement: $ => seq(
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
  ),

  // IF expr THEN stmts [ELSEIF expr THEN stmts]* [ELSE stmts] END IF
  if_statement: $ => seq(
    $.keyword_if,
    field('condition', $._expression),
    $.keyword_then,
    repeat(seq($.statement, ';')),
    repeat($.elseif_clause),
    optional($.else_clause),
    $.keyword_end,
    $.keyword_if,
  ),

  elseif_clause: $ => seq(
    $.keyword_elseif,
    field('condition', $._expression),
    $.keyword_then,
    repeat(seq($.statement, ';')),
  ),

  else_clause: $ => seq(
    $.keyword_else,
    repeat(seq($.statement, ';')),
  ),

  // LEAVE  (exit innermost loop/begin)
  leave_statement: $ => $.keyword_leave,

  // CONTINUE / ITERATE  (next loop iteration)
  continue_statement: $ => choice($.keyword_continue, $.keyword_iterate),

  // CALL procedure(args)
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    paren_list($._expression),
  ),

  // RAISE [USING MESSAGE = expr]
  raise_statement: $ => prec.right(seq(
    $.keyword_raise,
    optional(seq(
      $.keyword_using,
      $.keyword_message,
      '=',
      $._expression,
    )),
  )),

  // RETURN  (exit a procedure or script)
  return_statement: $ => $.keyword_return,

};
