import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // CURSOR name [(param type [, ...])] IS select; ; inside DECLARE block
  cursor_declaration: $ => seq(
    $.keyword_cursor,
    field('name', $.identifier),
    optional(paren_list($.cursor_param, true)),
    $.keyword_is,
    $._dml_read,
    ';',
  ),

  cursor_param: $ => seq(
    field('name', $.identifier),
    field('type', $._type),
    optional(seq($.keyword_default, $._expression)),
  ),

  // FOR rec IN cursor_or_select LOOP stmts END LOOP [label];
  cursor_for_loop: $ => seq(
    $.keyword_for,
    field('record', $.identifier),
    $.keyword_in,
    choice(
      field('cursor', $.identifier),
      seq('(', $._dml_read, ')'),
    ),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
    optional(field('label', $.identifier)),
  ),

  // OPEN cursor_name [(args)];
  cursor_open_statement: $ => seq(
    $.keyword_open,
    field('name', $.identifier),
    optional(paren_list(choice($.named_argument, $._expression), true)),
  ),

  // FETCH cursor_name INTO var [, var ...];
  cursor_fetch_statement: $ => seq(
    $.keyword_fetch,
    field('name', $.identifier),
    $.keyword_into,
    comma_list($.identifier, true),
  ),

  // CLOSE cursor_name;
  cursor_close_statement: $ => seq(
    $.keyword_close,
    field('name', $.identifier),
  ),

};
