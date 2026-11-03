import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // [label:] BEGIN [ATOMIC] stmts END [label]
  compound_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_begin,
    optional($.keyword_atomic),
    repeat(seq($.statement, ';')),
    $.keyword_end,
    optional(field('end_label', $.identifier)),
  ),

  // DECLARE name [, ...] type [DEFAULT expr]
  declare_statement: $ => seq(
    $.keyword_declare,
    comma_list($.identifier, true),
    $._type,
    optional(seq($.keyword_default, $._expression)),
  ),

  // SET name = expr
  set_variable_statement: $ => prec(1, seq(
    $.keyword_set,
    field('target', choice($.identifier, $._qualified_field)),
    '=',
    field('value', $._expression),
  )),

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

  // [label:] WHILE cond DO ... END WHILE [label]
  while_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_while,
    field('condition', $._expression),
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_while,
    optional(field('end_label', $.identifier)),
  ),

  // [label:] LOOP ... END LOOP [label]
  loop_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_loop,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_loop,
    optional(field('end_label', $.identifier)),
  ),

  // [label:] REPEAT stmts UNTIL cond END REPEAT [label]
  repeat_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_repeat,
    repeat(seq($.statement, ';')),
    $.keyword_until,
    field('condition', $._expression),
    $.keyword_end,
    $.keyword_repeat,
    optional(field('end_label', $.identifier)),
  ),

  // PIPE {expr [, …] | row-variable}; emits a row from a pipelined table
  // function.
  pipe_statement: $ => seq(
    $.keyword_pipe,
    comma_list($._expression, true),
  ),

  // {BEGIN | END} DECLARE SECTION; the embedded-SQL host-variable section.
  //
  // Lexed as one token per spelling rather than as three keywords. As three
  // keywords the END form is ambiguous with the END that closes every block
  // in this dialect (compound, IF, WHILE, LOOP, FOR, REPEAT), and resolving
  // that would mean GLR splitting on END everywhere. As a single token the
  // decision is the lexer's, settled by match length: `END DECLARE SECTION`
  // is longer than `END`, and a bare END still lexes as keyword_end.
  // The cost is that a comment or newline between the words is not accepted.
  declare_section_statement: $ => choice(
    field('begin', $.keyword_begin_declare_section),
    field('end', $.keyword_end_declare_section),
  ),

  keyword_begin_declare_section: _ => token(seq(
    /[bB][eE][gG][iI][nN]/, /[ \t]+/, /[dD][eE][cC][lL][aA][rR][eE]/,
    /[ \t]+/, /[sS][eE][cC][tT][iI][oO][nN]/,
  )),

  keyword_end_declare_section: _ => token(seq(
    /[eE][nN][dD]/, /[ \t]+/, /[dD][eE][cC][lL][aA][rR][eE]/,
    /[ \t]+/, /[sS][eE][cC][tT][iI][oO][nN]/,
  )),

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

  // OPEN cursor [USING expr, ...]
  open_cursor_statement: $ => seq(
    $.keyword_open,
    field('name', $.identifier),
    optional(seq($.keyword_using, comma_list($._expression, true))),
  ),

  // FETCH [FROM] cursor INTO var [, ...]
  fetch_cursor_statement: $ => seq(
    $.keyword_fetch,
    optional($.keyword_from),
    field('name', $.identifier),
    $.keyword_into,
    comma_list($.identifier, true),
  ),

  // [label:] FOR var AS [cur CURSOR [WITH HOLD] FOR] select DO ... END FOR [label]
  for_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_for,
    field('variable', $.identifier),
    $.keyword_as,
    optional(seq(
      field('cursor', $.identifier),
      $.keyword_cursor,
      repeat(seq($.keyword_with, choice($.keyword_hold, $.keyword_return))),
      $.keyword_for,
    )),
    $._dml_read,
    $.keyword_do,
    repeat(seq($.statement, ';')),
    $.keyword_end,
    $.keyword_for,
    optional(field('end_label', $.identifier)),
  ),

  // Dynamic SQL: PREPARE stmt FROM {'sql text' | host-variable}
  prepare_statement: $ => seq(
    $.keyword_prepare,
    field('name', $.identifier),
    $.keyword_from,
    choice(
      alias($._literal_string, $.literal),
      $.parameter,
    ),
  ),

  // EXECUTE stmt [USING var [, var …]]
  execute_statement: $ => seq(
    $.keyword_execute,
    field('name', $.identifier),
    optional(seq($.keyword_using, comma_list(choice($.parameter, $.identifier), true))),
  ),

  // {CREATE | ALTER | DROP | TRUNCATE} DATALAKE TABLE …
  // Db2's external-table surface over object storage. The tail is the Hive
  // vocabulary Db2 adopted for it.
  datalake_table_statement: $ => prec.right(seq(
    choice(
      seq($.keyword_create, optional($._or_replace)),
      $.keyword_alter,
      $.keyword_drop,
      $.keyword_truncate,
    ),
    $.keyword_datalake,
    $.keyword_table,
    optional(choice($._if_not_exists, $._if_exists)),
    field('name', $.object_reference),
    optional($.column_definitions),
    repeat($._datalake_option),
  )),

  _datalake_option: $ => choice(
    seq($.keyword_stored, $.keyword_as, field('format', $.identifier)),
    seq($.keyword_location, field('location', alias($._literal_string, $.literal))),
    seq(
      $.keyword_partitioned,
      $.keyword_by,
      choice($.column_definitions, paren_list($.identifier, true)),
    ),
    seq($.keyword_tblproperties, paren_list($._datalake_property, true)),
    seq($.keyword_row, $.keyword_format, field('row_format', alias($._literal_string, $.literal))),
  ),

  _datalake_property: $ => seq(
    field('key', alias($._literal_string, $.literal)),
    '=',
    field('value', alias($._literal_string, $.literal)),
  ),

};
