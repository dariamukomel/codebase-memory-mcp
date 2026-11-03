import { comma_list, optional_parenthesis, paren_list } from '../../grammar/helpers.js';

export default {

  // PostgreSQL: SELECT ... FOR UPDATE/SHARE [OF table, ...] [NOWAIT | SKIP LOCKED]
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
    choice(
      $.keyword_update,
      seq($.keyword_no, $.keyword_key, $.keyword_update),
      $.keyword_share,
      seq($.keyword_key, $.keyword_share),
    ),
    optional(seq($.keyword_of, comma_list($.object_reference, true))),
    optional(
      choice(
        $.keyword_nowait,
        seq($.keyword_skip, $.keyword_locked),
      ),
    ),
  ),

  // PostgreSQL: LOCK [TABLE] [ONLY] name [, ...] [IN lockmode MODE] [NOWAIT]
  lock_table_statement: $ => seq(
    $.keyword_lock,
    optional($.keyword_table),
    optional($.keyword_only),
    comma_list($.object_reference, true),
    optional(
      seq(
        $.keyword_in,
        choice(
          seq($.keyword_access, $.keyword_share),
          seq($.keyword_row, $.keyword_share),
          seq($.keyword_row, $.keyword_exclusive),
          seq($.keyword_share, $.keyword_update, $.keyword_exclusive),
          seq($.keyword_share, $.keyword_row, $.keyword_exclusive),
          $.keyword_share,
          $.keyword_exclusive,
          seq($.keyword_access, $.keyword_exclusive),
        ),
        $.keyword_mode,
      ),
    ),
    optional($.keyword_nowait),
  ),

  // PostgreSQL: PREPARE name [(data_type, ...)] AS statement
  prepare_statement: $ => seq(
    $.keyword_prepare,
    field('name', $.identifier),
    optional(paren_list($._type, true)),
    $.keyword_as,
    choice(
      $._dml_read,
      $._dml_write,
    ),
  ),

  // PostgreSQL: EXECUTE name [(parameter, ...)] [INTO target, ...]
  execute_statement: $ => seq(
    $.keyword_execute,
    field('name', $.identifier),
    optional(paren_list($._expression, true)),
    optional(
      seq(
        $.keyword_into,
        comma_list($.identifier, true),
      ),
    ),
  ),

  // PostgreSQL: DEALLOCATE [PREPARE] { name | ALL }
  deallocate_statement: $ => seq(
    $.keyword_deallocate,
    optional($.keyword_prepare),
    choice(
      field('name', $.identifier),
      $.keyword_all,
    ),
  ),

  // PostgreSQL 11+: CALL procedure(args)
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    paren_list(
      choice(
        seq($.identifier, '=>', $._expression),
        $._expression,
      ),
    ),
  ),

  // PostgreSQL: EXPLAIN ( option [value] [, ...] )
  explain_options: $ => paren_list(
    choice(
      seq(
        choice(
          $.keyword_analyze,
          $.keyword_verbose,
          $.keyword_costs,
          $.keyword_settings,
          $.keyword_generic_plan,
          $.keyword_buffers,
          $.keyword_wal,
          $.keyword_timing,
          $.keyword_summary,
        ),
        optional($._boolean_option),
      ),
      seq(
        $.keyword_format,
        choice(
          $.keyword_text,
          $.keyword_xml,
          $.keyword_json,
          $.keyword_yaml,
        ),
      ),
    ),
    true,
  ),

  _boolean_option: $ => choice(
    $.keyword_true,
    $.keyword_false,
    $.keyword_on,
    $.keyword_off,
  ),

  // PostgreSQL: GRANT ... ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA name
  _grant_object: $ => choice(
    seq($.keyword_table, $.object_reference),
    seq($.keyword_view, $.object_reference),
    seq($.keyword_schema, $.object_reference),
    seq($.keyword_database, $.object_reference),
    seq($.keyword_function, $.object_reference),
    seq($.keyword_procedure, $.object_reference),
    seq($.keyword_sequence, $.object_reference),
    seq(
      $.keyword_all,
      choice(
        $.keyword_tables,
        $.keyword_sequences,
        $.keyword_functions,
        $.keyword_procedures,
        $.keyword_routines,
      ),
      $.keyword_in,
      $.keyword_schema,
      comma_list($.object_reference, true),
    ),
    $.object_reference,
  ),

  // PostgreSQL: SELECT DISTINCT ON (expr, ...) ...
  select: $ => seq(
    $.keyword_select,
    seq(
      optional(
        seq(
          $.keyword_distinct,
          optional(seq($.keyword_on, paren_list($._expression, true))),
        ),
      ),
      $.select_expression,
    ),
  ),

  // PostgreSQL: DELETE FROM ... USING from_list
  _delete_from: $ => seq(
    $.keyword_from,
    optional(
      $.keyword_only,
    ),
    field('target', $.object_reference),
    optional(seq($.keyword_using, comma_list(field('source', $.relation), true))),
    optional($.where),
    optional($.order_by),
    optional($.limit),
  ),

};
