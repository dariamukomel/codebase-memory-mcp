import { comma_list, paren_list, optional_parenthesis, make_keyword } from '../../grammar/helpers.js';

export default {

  // TABLESAMPLE [ BERNOULLI | SYSTEM ] ( <percentage> ) [ REPEATABLE ( <seed> ) ]; the method is optional in HANA.
  tablesample: $ => seq(
    $.keyword_tablesample,
    optional(choice($.keyword_bernoulli, $.keyword_system)),
    '(',
    $._natural_number,
    ')',
    optional(seq($.keyword_repeatable, '(', $._natural_number, ')')),
  ),

  // HANA: CREATE [COLUMN|ROW] [GLOBAL TEMPORARY|LOCAL TEMPORARY] TABLE
  create_table: $ => prec.right(
    seq(
      $.keyword_create,
      optional(choice($.keyword_column, $.keyword_row)),
      optional(choice(
        seq($.keyword_global, $.keyword_temporary),
        seq($.keyword_local, $.keyword_temporary),
        $._temporary,
      )),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional($.column_definitions),
      optional(seq($.keyword_as, $.create_query)),
    ),
  ),

  // HANA: UPSERT t [(cols)] VALUES (…) [WITH PRIMARY KEY | WHERE cond]
  //       UPSERT t SELECT …
  upsert_statement: $ => prec.right(seq(
    $.keyword_upsert,
    $.object_reference,
    choice(
      seq(
        optional(alias($._column_list, $.list)),
        $.keyword_values,
        paren_list($._expression, true),
        optional(choice(
          seq($.keyword_with, $.keyword_primary, $.keyword_key),
          $.where,
        )),
      ),
      $._dml_read,
    ),
  )),

  // HANA: statement-level WITH HINT (HINT_NAME(args), …)
  with_hint_clause: $ => seq(
    $.keyword_with,
    $.keyword_hint,
    paren_list(choice($.invocation, $.identifier), true),
  ),

  // HANA: CREATE [OR REPLACE] PROCEDURE p (params) [LANGUAGE SQLSCRIPT]
  //   [SQL SECURITY INVOKER|DEFINER] [READS SQL DATA] AS BEGIN … END
  create_procedure: $ => seq(
    $.keyword_create,
    optional(seq($.keyword_or, $.keyword_replace)),
    $.keyword_procedure,
    $.object_reference,
    optional(paren_list($.procedure_parameter, false)),
    optional(seq($.keyword_language, $.keyword_sqlscript)),
    optional(seq($.keyword_sql, $.keyword_security, choice($.keyword_invoker, $.keyword_definer))),
    optional(seq($.keyword_reads, $.keyword_sql, $.keyword_data)),
    $.keyword_as,
    $.compound_statement,
  ),

  procedure_parameter: $ => seq(
    optional(choice($.keyword_in, $.keyword_out, $.keyword_inout)),
    field('name', $.identifier),
    field('type', $._type),
  ),

  // SQLScript block: BEGIN [declares] statements END
  // (shared node name: db2 and others also expose compound_statement)
  compound_statement: $ => seq(
    $.keyword_begin,
    repeat($._sqlscript_statement),
    $.keyword_end,
  ),

  // Statements allowed inside a SQLScript block or control-flow body.
  _sqlscript_statement: $ => choice(
    seq($.declare_statement, ';'),
    seq($.assignment_statement, ';'),
    seq($.if_statement, ';'),
    seq($.while_statement, ';'),
    seq($.for_statement, ';'),
    seq($.keyword_break, ';'),
    seq($.keyword_continue, ';'),
    seq($.statement, ';'),
  ),

  // IF cond THEN … [ELSEIF cond THEN …] [ELSE …] END IF
  if_statement: $ => seq(
    $.keyword_if,
    field('condition', $._expression),
    $.keyword_then,
    repeat($._sqlscript_statement),
    repeat(seq(
      $.keyword_elseif,
      field('condition', $._expression),
      $.keyword_then,
      repeat($._sqlscript_statement),
    )),
    optional(seq($.keyword_else, repeat($._sqlscript_statement))),
    $.keyword_end,
    $.keyword_if,
  ),

  // WHILE cond DO … END WHILE
  while_statement: $ => seq(
    $.keyword_while,
    field('condition', $._expression),
    $.keyword_do,
    repeat($._sqlscript_statement),
    $.keyword_end,
    $.keyword_while,
  ),

  // FOR i IN lower..upper [REVERSE] DO … END FOR
  for_statement: $ => seq(
    $.keyword_for,
    field('index', $.identifier),
    $.keyword_in,
    optional($.keyword_reverse),
    field('lower', $._expression),
    '..',
    field('upper', $._expression),
    $.keyword_do,
    repeat($._sqlscript_statement),
    $.keyword_end,
    $.keyword_for,
  ),

  keyword_while:    _ => token(prec(1, make_keyword("while"))),
  keyword_elseif:   _ => token(prec(1, make_keyword("elseif"))),
  keyword_break:    _ => token(prec(1, make_keyword("break"))),
  keyword_continue: _ => token(prec(1, make_keyword("continue"))),
  keyword_reverse:  _ => token(prec(1, make_keyword("reverse"))),

  // DECLARE v [CONSTANT] TYPE [:= expr | DEFAULT expr]
  declare_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    optional($.keyword_constant),
    field('type', $._type),
    optional(choice(
      seq(':=', $._expression),
      seq($.keyword_default, $._expression),
    )),
  ),

  // v := expr  (SQLScript scalar assignment)
  assignment_statement: $ => seq(
    field('name', $.identifier),
    choice(
      // scalar variable
      seq(':=', $._expression),
      // table variable: tabvar = SELECT … (or another table variable)
      seq('=', choice($._dml_read, $._expression)),
    ),
  ),

  // base _select_statement plus HANA row locking
  _select_statement: $ => optional_parenthesis(
    seq(
      $.select,
      optional(
        seq(
          $.keyword_into,
          $.select_expression,
        ),
      ),
      optional($.from),
      optional($.locking_clause),
    ),
  ),

  // FOR UPDATE [OF col, …] [NOWAIT | WAIT n | IGNORE LOCKED]
  locking_clause: $ => seq(
    $.keyword_for,
    $.keyword_update,
    optional(seq($.keyword_of, comma_list($.object_reference, true))),
    optional(
      choice(
        $.keyword_nowait,
        seq($.keyword_wait, alias($._integer, $.literal)),
        seq($.keyword_ignore, $.keyword_locked),
      ),
    ),
  ),

};
