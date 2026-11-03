import { comma_list, optional_parenthesis, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // Oracle: SELECT … FOR UPDATE [OF cols] [NOWAIT | WAIT n | SKIP LOCKED]
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
      repeat($.locking_clause),
    ),
  ),

  locking_clause: $ => seq(
    $.keyword_for,
    $.keyword_update,
    optional(seq($.keyword_of, comma_list($.object_reference, true))),
    optional(
      choice(
        $.keyword_nowait,
        seq($.keyword_wait, alias($._integer, $.literal)),
        seq($.keyword_skip, $.keyword_locked),
      ),
    ),
  ),

  // ANALYZE TABLE t COMPUTE STATISTICS | ESTIMATE STATISTICS [SAMPLE n ROWS|PERCENT]
  //   | VALIDATE STRUCTURE [CASCADE]
  // ANALYZE INDEX idx VALIDATE STRUCTURE
  analyze_statement: $ => seq(
    $.keyword_analyze,
    choice($.keyword_table, $.keyword_index),
    $.object_reference,
    choice(
      seq($.keyword_compute, $.keyword_statistics),
      seq(
        $.keyword_estimate,
        $.keyword_statistics,
        optional(seq(
          $.keyword_sample,
          alias($._integer, $.literal),
          choice($.keyword_rows, $.keyword_percent),
        )),
      ),
      seq($.keyword_validate, $.keyword_structure, optional($.keyword_cascade)),
    ),
  ),

  // MODEL [IGNORE|KEEP NAV] [RETURN UPDATED|ALL ROWS]
  //   [PARTITION BY (…)] DIMENSION BY (…) MEASURES (…)
  //   RULES [UPDATE | UPSERT [ALL]] [SEQUENTIAL|AUTOMATIC ORDER]
  //   [ITERATE (n) [UNTIL (cond)]] ( cell = expr [, …] )
  model_clause: $ => seq(
    $.keyword_model,
    optional(seq(choice($.keyword_ignore, $.keyword_keep), $.keyword_nav)),
    optional(seq(
      $.keyword_return,
      choice($.keyword_updated, $.keyword_all),
      $.keyword_rows,
    )),
    optional(seq(
      $.keyword_partition,
      $.keyword_by,
      paren_list(alias($.model_column, $.term), true),
    )),
    $.keyword_dimension,
    $.keyword_by,
    paren_list(alias($.model_column, $.term), true),
    $.keyword_measures,
    paren_list(alias($.model_column, $.term), true),
    $.keyword_rules,
    optional(choice(
      $.keyword_update,
      seq($.keyword_upsert, optional($.keyword_all)),
    )),
    optional(seq(
      choice($.keyword_sequential, $.keyword_automatic),
      $.keyword_order,
    )),
    optional(seq(
      $.keyword_iterate,
      wrapped_in_parenthesis(alias($._integer, $.literal)),
      optional(seq($.keyword_until, wrapped_in_parenthesis($._expression))),
    )),
    paren_list($.model_rule, true),
  ),

  model_column: $ => seq(
    field('value', $._expression),
    optional($._alias),
  ),

  // sales[2025] = sales[2024] * 1.1
  model_rule: $ => seq(
    $.model_cell,
    '=',
    $._expression,
  ),

  model_cell: $ => seq(
    field('name', $.identifier),
    '[',
    comma_list($._expression, true),
    ']',
  ),

  // ALTER SESSION SET param = value [param = value …]
  // ALTER SESSION ENABLE|DISABLE|FORCE PARALLEL DML|DDL|QUERY
  alter_session_statement: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_session,
    choice(
      seq(
        $.keyword_set,
        repeat1(seq(
          field('parameter', $.identifier),
          '=',
          field('value', choice($._expression, $.keyword_serializable)),
        )),
      ),
      seq(
        choice($.keyword_enable, $.keyword_disable, $.keyword_force),
        $.keyword_parallel,
        $.identifier,
      ),
    ),
  )),

  // ALTER SYSTEM …
  alter_system_statement: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_system,
    choice(
      seq(
        $.keyword_set,
        repeat1(seq(
          field('parameter', $.identifier),
          '=',
          field('value', $._expression),
        )),
        optional(seq(
          $.keyword_scope,
          '=',
          choice($.keyword_memory, $.keyword_spfile, $.keyword_both),
        )),
        optional(seq(
          $.keyword_sid,
          '=',
          alias($._literal_string, $.literal),
        )),
      ),
      seq($.keyword_flush, $.identifier),
      seq(
        $.keyword_kill,
        $.keyword_session,
        alias($._literal_string, $.literal),
        optional($.keyword_immediate),
      ),
      $.keyword_checkpoint,
      seq($.keyword_switch, $.keyword_logfile),
      seq($.keyword_archive, $.keyword_log, $.keyword_current),
    ),
  )),

  // CREATE [OR REPLACE] DIRECTORY name AS 'path'
  create_directory_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_directory,
    field('name', $.identifier),
    $.keyword_as,
    field('path', alias($._literal_string, $.literal)),
  ),

  // DROP DIRECTORY name
  drop_directory_statement: $ => seq(
    $.keyword_drop,
    $.keyword_directory,
    field('name', $.identifier),
  ),

  // GRANT READ, WRITE ON DIRECTORY dir TO user
  _privilege_type: $ => choice(
    $.keyword_select,
    $.keyword_insert,
    $.keyword_update,
    $.keyword_delete,
    $.keyword_execute,
    $.keyword_usage,
    $.keyword_references,
    $.keyword_trigger,
    $.keyword_read,
    $.keyword_write,
    seq($.keyword_all, optional($.keyword_privileges)),
  ),

  _grant_object: $ => choice(
    seq($.keyword_table, $.object_reference),
    seq($.keyword_view, $.object_reference),
    seq($.keyword_schema, $.object_reference),
    seq($.keyword_database, $.object_reference),
    seq($.keyword_function, $.object_reference),
    seq($.keyword_procedure, $.object_reference),
    seq($.keyword_sequence, $.object_reference),
    seq($.keyword_directory, $.object_reference),
    $.object_reference,
  ),

};
