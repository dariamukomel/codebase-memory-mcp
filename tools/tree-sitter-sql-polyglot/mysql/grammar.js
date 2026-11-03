import base from '../grammar.js';
import { comma_list, optional_parenthesis, wrapped_in_parenthesis, make_keyword, paren_list, canonicalOrder } from '../grammar/helpers.js';
import mysql_create_rules from './grammar/create.js';
import mysql_optimize_rules from './grammar/optimize.js';
import mysql_load_data_rules from './grammar/load_data.js';
import mysql_events_rules from './grammar/events.js';
import mysql_procedural_rules from './grammar/procedural.js';
import mysql_partition_rules from './grammar/partition.js';
import mysql_admin_rules from './grammar/admin.js';
import mysql_admin_ddl_rules from './grammar/admin_ddl.js';
import mysql_clause_rules from './grammar/clauses.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'mysql_sql',

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
    [$.field, $._qualified_field],
    [$._column, $._qualified_field],
    [$.object_reference],
    // Local shift/reduce ambiguity shared with like_expression's optional
    // ESCAPE tail; kept in sync with the base grammar's conflicts.
    [$.between_expression, $.binary_expression, $.like_expression],
    // Base transaction/call additions (conflicts do not propagate from the parent; kept in sync with grammar.js).
    [$.transaction, $.start_transaction_statement],
    [$.transaction, $.commit_statement],
    [$.transaction, $.rollback_statement],
    [$._commit, $.commit_statement],
    [$._rollback, $.rollback_statement],
    [$.create_function],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
    [$._function_return, $.return_statement],
    [$._qualified_field, $.set_assignment],
    [$.alter_partition],
    [$.declare_statement, $.declare_cursor_statement, $.declare_condition_statement, $.declare_handler_statement],
    [$.statement, $.declare_handler_statement],
    // DELETE t1, t2 FROM …: targets look like relations until FROM appears.
    [$.relation, $._delete_target],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional($._temporary),
        $.keyword_table,
        optional($._if_not_exists),
        field("target", $.object_reference),
        seq(
          optional($.column_definitions),
          repeat($.table_option),
          optional(seq($.keyword_as, $.create_query)),
        ),
        optional($.table_partition_by),
      ),
    ),

    // No CREATE MATERIALIZED VIEW: no materialized views upstream in MySQL.
    _create_statement: $ => seq(
      choice(
        $.create_table,
        $.create_view,
        $.create_index,
        $.create_function,
        $.create_procedure,
        $.create_type,
        $.create_database,
        $.create_role,
        $.create_sequence,
        $.create_trigger,
        $.create_event,
        $.create_schema,
      ),
    ),

    _optimize_statement: $ => $._mariadb_optimize_table,

    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._optimize_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.show_statement,
      $.describe_statement,
      $.grant_statement,
      $.revoke_statement,
      $.create_user_statement,
      $.alter_user_statement,
      $.drop_user_statement,
      $.rename_user_statement,
      $.repair_table_statement,
      $.check_table_statement,
      $.analyze_table_statement,
      $.comment_statement,
      $.prepare_statement,
      $.execute_statement,
      $.deallocate_statement,
      // grammar/admin_ddl.js
      $.alter_event,
      $.drop_event,
      $.create_server,
      $.alter_server,
      $.drop_server,
      $.create_tablespace,
      $.alter_tablespace,
      $.drop_tablespace,
      $.create_logfile_group,
      $.alter_logfile_group,
      $.drop_logfile_group,
      $.create_spatial_reference_system,
      $.drop_spatial_reference_system,
      $.create_resource_group,
      $.drop_resource_group,
      $.set_resource_group,
      $.alter_instance,
    ),

    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
        $._truncate_statement,
        $.load_data_statement,
      ),
    ),

    _dml_read: $ => seq(
      optional(optional_parenthesis($._cte)),
      optional_parenthesis(
        choice(
          $._select_statement,
          $.set_operation,
          $.values_row_statement,
          $.table_statement,
        ),
      ),
    ),


    insert: $ => seq(
      choice(
        $.keyword_insert,
        $.keyword_replace,
      ),
      optional(
        choice(
          $.keyword_low_priority,
          $.keyword_delayed,
          $.keyword_high_priority,
        ),
      ),
      optional($.keyword_ignore),
      optional($.keyword_into),
      field('target', $.object_reference),
      optional(
        seq(
          $.keyword_as,
          field('alias', $.identifier),
        ),
      ),
      choice(
        $._insert_values,
        $._set_values,
      ),
      optional(
        choice(
          $._on_conflict,
          $._on_duplicate_key_update,
        ),
      ),
    ),

    from: $ => seq(
      $.keyword_from,
      optional($.keyword_only),
      comma_list(field('relation', $.relation), true),
      optional($.index_hint),
      repeat(
        choice(
          $.join,
          $.cross_join,
          $.lateral_join,
          $.lateral_cross_join,
        ),
      ),
      optional($.where),
      optional($.group_by),
      optional($.having),
      optional($.window_clause),
      optional($.order_by),
      // MySQL paging is LIMIT/OFFSET only; no ANSI OFFSET…FETCH FIRST.
      optional($.limit),
      optional($.into_outfile),
    ),

    // MySQL DELETE: single-table plus the two multi-table forms.
    //   DELETE FROM t WHERE …                          (single, base _delete_from)
    //   DELETE t1[.*], t2[.*] FROM t1 JOIN t2 …        (targets before FROM)
    //   DELETE FROM t1, t2 USING t1 JOIN t2 …          (USING form)
    _delete_statement: $ => seq(
      $.delete,
      choice(
        alias($._delete_from, $.from),
        seq(
          comma_list(field('target', $._delete_target), true),
          $.from,
        ),
        seq(
          $.keyword_from,
          comma_list(field('target', $._delete_target), true),
          $.keyword_using,
          comma_list(field('source', $.relation), true),
          repeat(choice($.join, $.cross_join, $.lateral_join, $.lateral_cross_join)),
          optional($.where),
        ),
      ),
    ),

    _delete_target: $ => seq(
      $.object_reference,
      optional(seq('.', '*')),
    ),

    join: $ => seq(
      optional($.keyword_natural),
      choice(
        seq(
          optional(
            choice(
              $.keyword_left,
              seq($.keyword_full, $.keyword_outer),
              seq($.keyword_left, $.keyword_outer),
              $.keyword_right,
              seq($.keyword_right, $.keyword_outer),
              $.keyword_inner,
              $.keyword_full,
            ),
          ),
          $.keyword_join,
        ),
        // MySQL STRAIGHT_JOIN forces the optimizer to read the left table first.
        $.keyword_straight_join,
      ),
      field('relation', $.relation),
      optional($.index_hint),
      optional($.join),
      choice(
        seq(
          $.keyword_on,
          field('predicate', $._expression),
        ),
        seq(
          $.keyword_using,
          alias($._column_list, $.list),
        ),
      ),
    ),

    // MySQL: relation includes JSON_TABLE
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.json_table,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.tablesample),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // MySQL: GROUP BY supports trailing WITH ROLLUP (no WITH CUBE; MySQL
    // never implemented that form, unlike T-SQL).
    group_by: $ => prec.left(seq(
      $.keyword_group,
      $.keyword_by,
      comma_list(choice(
        $._expression,
        $.rollup_clause,
        $.cube_clause,
        $.grouping_sets_clause,
      ), true),
      optional(seq($.keyword_with, $.keyword_rollup)),
    )),

    // MySQL: window functions support IGNORE/RESPECT NULLS
    window_function: $ => seq(
      $.invocation,
      optional(choice(
        seq($.keyword_ignore, $.keyword_nulls),
        seq($.keyword_respect, $.keyword_nulls),
      )),
      $.keyword_over,
      choice(
        $.identifier,
        $.window_specification,
      ),
    ),

    // MySQL: override _column_constraint to add AUTO_INCREMENT, STORED/VIRTUAL, INVISIBLE
    _column_constraint: $ => prec.left(choice(
      choice(
        $.keyword_null,
        $._not_null,
      ),
      seq(
        $.keyword_references,
        $.object_reference,
        paren_list($.identifier, true),
        repeat(
          seq(
            $.keyword_on,
            choice($.keyword_delete, $.keyword_update),
            choice(
              seq($.keyword_no, $.keyword_action),
              $.keyword_restrict,
              $.keyword_cascade,
              seq(
                $.keyword_set,
                choice($.keyword_null, $.keyword_default),
                  optional(paren_list($.identifier, true))
              ),
            ),
          ),
        ),
      ),
      $._default_expression,
      $._primary_key,
      $.keyword_auto_increment,
      $.direction,
      $._column_comment,
      $._check_constraint,
      // Generated / computed column: GENERATED ALWAYS AS (expr) [STORED|VIRTUAL]
      seq(
        optional(seq($.keyword_generated, $.keyword_always)),
        $.keyword_as,
        wrapped_in_parenthesis($._expression),
        optional(choice($.keyword_stored, $.keyword_virtual)),
      ),
      $.keyword_invisible,
      $.keyword_visible,
      $.keyword_unique,
    )),

    // MySQL: override table_option to support ENGINE=
    table_option: $ => choice(
      seq($.keyword_default, $.keyword_character, $.keyword_set, $.identifier),
      seq($.keyword_collate, $.identifier),
      field('name', $.keyword_default),
      seq(
        field('name', choice($.keyword_engine, $.identifier, $._literal_string)),
        '=',
        field('value', choice($.identifier, $._literal_string, alias($._integer, $.literal))),
      ),
    ),

    // MySQL 8: VALUES ROW(...) constructor
    values_row_statement: $ => seq(
      $.keyword_values,
      comma_list(
        seq(
          $.keyword_row,
          wrapped_in_parenthesis(comma_list($._expression, true)),
        ),
        true,
      ),
    ),

    // MySQL 8: TABLE t [ORDER BY ...] [LIMIT n]
    table_statement: $ => seq(
      $.keyword_table,
      $.object_reference,
      optional($.order_by),
      optional($.limit),
    ),

    // MySQL: JSON_TABLE(expr, path COLUMNS (...))
    json_table: $ => seq(
      $.keyword_json_table,
      '(',
      field('expr', $._expression),
      ',',
      field('path', alias($._literal_string, $.literal)),
      $.keyword_columns,
      '(',
      comma_list($._json_table_column_def, true),
      ')',
      ')',
    ),

    _json_table_column_def: $ => seq(
      field('name', $.identifier),
      field('type', $._type),
      $.keyword_path,
      field('path', alias($._literal_string, $.literal)),
    ),

    // SHOW TABLES / DATABASES / COLUMNS / INDEX / CREATE TABLE / PROCESSLIST / STATUS / VARIABLES / WARNINGS / ERRORS / GRANTS
    show_statement: $ => seq(
      $.keyword_show,
      optional($.keyword_full),
      choice(
        seq(
          $.keyword_tables,
          optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
          optional(seq($.keyword_like, $._expression)),
        ),
        $.keyword_databases,
        seq(
          choice($.keyword_columns, $.keyword_fields),
          $.keyword_from,
          $.object_reference,
        ),
        seq(
          choice($.keyword_index, $.keyword_indexes, $.keyword_keys),
          $.keyword_from,
          $.object_reference,
        ),
        seq($.keyword_create, $.keyword_table, $.object_reference),
        $.keyword_processlist,
        seq($.keyword_status, optional(seq($.keyword_like, $._expression))),
        seq($.keyword_variables, optional(seq($.keyword_like, $._expression))),
        seq($.keyword_warnings, optional($.limit)),
        $.keyword_errors,
        $.keyword_grants,
      ),
    ),

    // DESCRIBE table [column] / DESC table [column]
    describe_statement: $ => seq(
      choice($.keyword_describe, $.keyword_desc),
      $.object_reference,
      optional($.identifier),
    ),

    // Override limit: MySQL also supports LIMIT offset, count (comma form).
    // prec.right (as in base): a following OFFSET binds to the limit clause
    // rather than starting an ANSI OFFSET … ROWS offset_fetch_clause.
    limit: $ => prec.right(seq(
      $.keyword_limit,
      choice(
        seq(alias($._integer, $.literal), ',', alias($._integer, $.literal)),
        seq($.literal, optional($.offset)),
      ),
    )),

    // MySQL user/session variables: @name and @@name
    user_variable: _ => token(/@@?[a-zA-Z_][a-zA-Z0-9_]*/),

    // Extend _expression to include user variables
    _expression: $ => prec(1,
      choice(
        $.user_variable,
        $.match_against,
        $.literal,
        $.position_expression,
        alias($._qualified_field, $.field),
        $.parameter,
        $.list,
        $.case,
        $.window_function,
        $.subquery,
        $.cast,
        $.exists,
        $.invocation,
        $.binary_expression,
        $.subscript,
        $.unary_expression,
        $.array,
        $.interval,
        $.between_expression,
        // Inherited from base but this dialect fully re-enumerates
        // _expression: LIKE/NOT LIKE now parse exclusively through
        // like_expression (with optional ESCAPE), not binary_expression.
        $.like_expression,
        // ANSI typed temporal literal (F051-03): DATE/TIME/TIMESTAMP '…'.
        $.typed_temporal_literal,
        $.parenthesized_expression,
      ),
    ),

    // Full-text search: MATCH (col, …) AGAINST (expr [search modifier])
    match_against: $ => seq(
      $.keyword_match,
      '(',
      comma_list(alias($._qualified_field, $.field), true),
      ')',
      $.keyword_against,
      '(',
      $._expression,
      optional(choice(
        seq($.keyword_in, $.keyword_boolean, $.keyword_mode),
        seq($.keyword_in, $.keyword_natural, $.keyword_language, $.keyword_mode,
            optional(seq($.keyword_with, $.keyword_query, $.keyword_expansion))),
        seq($.keyword_with, $.keyword_query, $.keyword_expansion),
      )),
      ')',
    ),

    keyword_match:     _ => token(prec(1, make_keyword("match"))),
    keyword_against:   _ => token(prec(1, make_keyword("against"))),
    keyword_query:     _ => token(prec(1, make_keyword("query"))),
    keyword_expansion: _ => token(prec(1, make_keyword("expansion"))),

    _backtick_quoted_string: _ => /`[^`]*`/,

    identifier: $ => choice(
      $._identifier,
      $.dynamic_identifier,
      $.dynamic_composite_identifier,
      $._double_quote_string,
      $._backtick_quoted_string,
      // NB: no separate seq("`", _identifier, "`") alternative; the
      // _backtick_quoted_string token (/`[^`]*`/) already matches every
      // `quoted` identifier and wins the lexer's longest-match over a bare
      // "`", so that sequence was unreachable dead weight in the parse table.
    ),

    // MySQL-specific keywords (not ANSI); also defined in grammar/keywords.js for extraction
    // Locking / SET scopes / user management / maintenance (#101, #102, #106, #107)
    keyword_share:           _ => token(prec(1, make_keyword("share"))),
    keyword_lock:            _ => token(prec(1, make_keyword("lock"))),
    keyword_locked:          _ => token(prec(1, make_keyword("locked"))),
    keyword_prepare:         _ => token(prec(1, make_keyword("prepare"))),
    keyword_deallocate:      _ => token(prec(1, make_keyword("deallocate"))),
    keyword_skip:            _ => token(prec(1, make_keyword("skip"))),
    keyword_mode:            _ => token(prec(1, make_keyword("mode"))),
    keyword_global:          _ => token(prec(1, make_keyword("global"))),
    keyword_persist:         _ => token(prec(1, make_keyword("persist"))),
    keyword_persist_only:    _ => token(prec(1, /[Pp][Ee][Rr][Ss][Ii][Ss][Tt]_[Oo][Nn][Ll][Yy]/)),
    keyword_names:           _ => token(prec(1, make_keyword("names"))),
    keyword_expire:          _ => token(prec(1, make_keyword("expire"))),
    keyword_account:         _ => token(prec(1, make_keyword("account"))),
    keyword_unlock:          _ => token(prec(1, make_keyword("unlock"))),
    keyword_identified:      _ => token(prec(1, make_keyword("identified"))),
    keyword_quick:           _ => token(prec(1, make_keyword("quick"))),
    keyword_extended:        _ => token(prec(1, make_keyword("extended"))),
    keyword_fast:            _ => token(prec(1, make_keyword("fast"))),
    keyword_medium:          _ => token(prec(1, make_keyword("medium"))),
    keyword_changed:         _ => token(prec(1, make_keyword("changed"))),
    keyword_upgrade:         _ => token(prec(1, make_keyword("upgrade"))),
    keyword_histogram:       _ => token(prec(1, make_keyword("histogram"))),
    keyword_buckets:         _ => token(prec(1, make_keyword("buckets"))),
    keyword_repair:          _ => token(prec(1, make_keyword("repair"))),
    keyword_use_frm:         _ => token(prec(1, /[Uu][Ss][Ee]_[Ff][Rr][Mm]/)),
    keyword_no_write_to_binlog: _ => token(prec(1, /[Nn][Oo]_[Ww][Rr][Ii][Tt][Ee]_[Tt][Oo]_[Bb][Ii][Nn][Ll][Oo][Gg]/)),

    keyword_auto_increment: _ => token(prec(1, make_keyword("auto_increment"))),
    keyword_stored:         _ => token(prec(1, make_keyword("stored"))),
    keyword_virtual:        _ => token(prec(1, make_keyword("virtual"))),
    keyword_optimize:       _ => token(prec(1, make_keyword("optimize"))),
    keyword_engine:         _ => token(prec(1, make_keyword("engine"))),
    keyword_high_priority:  _ => token(prec(1, make_keyword("high_priority"))),
    keyword_low_priority:   _ => token(prec(1, make_keyword("low_priority"))),
    keyword_delayed:        _ => token(prec(1, make_keyword("delayed"))),
    keyword_rlike:          _ => token(prec(1, choice(make_keyword("rlike"), make_keyword("regexp")))),
    keyword_split:          _ => token(prec(1, make_keyword("split"))),
    keyword_tablets:        _ => token(prec(1, make_keyword("tablets"))),
    keyword_ignore:         _ => token(prec(1, make_keyword("ignore"))),
    keyword_fields:         _ => token(prec(1, make_keyword("fields"))),
    keyword_terminated:     _ => token(prec(1, make_keyword("terminated"))),
    keyword_lines:          _ => token(prec(1, make_keyword("lines"))),
    keyword_outfile:        _ => token(prec(1, make_keyword("outfile"))),
    keyword_dumpfile:       _ => token(prec(1, make_keyword("dumpfile"))),
    // INTO is reserved in MySQL; bias the lexer so a trailing INTO OUTFILE is
    // not mis-lexed as a relation alias identifier.
    keyword_into:           _ => token(prec(1, make_keyword("into"))),
    keyword_rollup:         _ => token(prec(1, make_keyword("rollup"))),
    keyword_event:          _ => token(prec(1, make_keyword("event"))),
    keyword_every:          _ => token(prec(1, make_keyword("every"))),
    keyword_starts:         _ => token(prec(1, make_keyword("starts"))),
    keyword_ends:           _ => token(prec(1, make_keyword("ends"))),
    keyword_invisible:      _ => token(prec(1, make_keyword("invisible"))),
    keyword_visible:        _ => token(prec(1, make_keyword("visible"))),
    keyword_enclosed:       _ => token(prec(1, make_keyword("enclosed"))),
    keyword_respect:        _ => token(prec(1, make_keyword("respect"))),
    keyword_completion:     _ => token(prec(1, make_keyword("completion"))),
    keyword_preserve:       _ => token(prec(1, make_keyword("preserve"))),
    keyword_slave:          _ => token(prec(1, make_keyword("slave"))),
    keyword_json_table:     _ => token(prec(1, make_keyword("json_table"))),
    keyword_path:           _ => token(prec(1, make_keyword("path"))),
    keyword_infile:         _ => token(prec(1, make_keyword("infile"))),
    keyword_databases:      _ => token(prec(1, make_keyword("databases"))),
    keyword_processlist:    _ => token(prec(1, make_keyword("processlist"))),
    keyword_status:         _ => token(prec(1, make_keyword("status"))),
    keyword_warnings:       _ => token(prec(1, make_keyword("warnings"))),
    keyword_variables:      _ => token(prec(1, make_keyword("variables"))),
    keyword_indexes:        _ => token(prec(1, make_keyword("indexes"))),
    keyword_describe:       _ => token(prec(1, make_keyword("describe"))),
    keyword_schedule:       _ => token(prec(1, make_keyword("schedule"))),
    keyword_at:             _ => token(prec(1, make_keyword("at"))),
    keyword_load:           _ => token(prec(1, make_keyword("load"))),
    keyword_escaped:        _ => token(prec(1, make_keyword("escaped"))),
    keyword_grants:         _ => token(prec(1, make_keyword("grants"))),
    keyword_show:           _ => token(prec(1, make_keyword("show"))),
    keyword_columns:        _ => token(prec(1, make_keyword("columns"))),
    keyword_keys:           _ => token(prec(1, make_keyword("keys"))),
    keyword_escape:         _ => token(prec(1, make_keyword("escape"))),
    keyword_follows:        _ => token(prec(1, make_keyword("follows"))),
    keyword_precedes:       _ => token(prec(1, make_keyword("precedes"))),

    // MySQL procedural keywords
    keyword_while:              _ => token(prec(1, make_keyword("while"))),
    keyword_elseif:             _ => token(prec(1, make_keyword("elseif"))),
    keyword_loop:               _ => token(prec(1, make_keyword("loop"))),
    keyword_repeat:             _ => token(prec(1, make_keyword("repeat"))),
    keyword_signal:             _ => token(prec(1, make_keyword("signal"))),
    keyword_resignal:           _ => token(prec(1, make_keyword("resignal"))),
    keyword_leave:              _ => token(prec(1, make_keyword("leave"))),
    keyword_iterate:            _ => token(prec(1, make_keyword("iterate"))),
    keyword_diagnostics:        _ => token(prec(1, make_keyword("diagnostics"))),
    keyword_sqlstate:           _ => token(prec(1, make_keyword("sqlstate"))),
    keyword_message_text:       _ => token(prec(1, make_keyword("message_text"))),
    keyword_returned_sqlstate:  _ => token(prec(1, make_keyword("returned_sqlstate"))),
    keyword_condition:          _ => token(prec(1, make_keyword("condition"))),
    keyword_get:                _ => token(prec(1, make_keyword("get"))),
    keyword_call:               _ => token(prec(1, make_keyword("call"))),
    keyword_declare:            _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:             _ => token(prec(1, make_keyword("cursor"))),
    keyword_open:               _ => token(prec(1, make_keyword("open"))),
    keyword_fetch:              _ => token(prec(1, make_keyword("fetch"))),
    keyword_close:              _ => token(prec(1, make_keyword("close"))),
    keyword_handler:            _ => token(prec(1, make_keyword("handler"))),
    keyword_sqlexception:       _ => token(prec(1, make_keyword("sqlexception"))),
    keyword_sqlwarning:         _ => token(prec(1, make_keyword("sqlwarning"))),
    keyword_exit:               _ => token(prec(1, make_keyword("exit"))),
    keyword_continue:           _ => token(prec(1, make_keyword("continue"))),
    keyword_found:              _ => token(prec(1, make_keyword("found"))),

    // MySQL partition keywords
    keyword_list:               _ => token(prec(1, make_keyword("list"))),
    keyword_partitions:         _ => token(prec(1, make_keyword("partitions"))),
    keyword_less:               _ => token(prec(1, make_keyword("less"))),
    keyword_than:               _ => token(prec(1, make_keyword("than"))),
    keyword_reorganize:         _ => token(prec(1, make_keyword("reorganize"))),
    keyword_coalesce:           _ => token(prec(1, make_keyword("coalesce"))),
    keyword_rebuild:            _ => token(prec(1, make_keyword("rebuild"))),
    keyword_remove:             _ => token(prec(1, make_keyword("remove"))),
    keyword_partitioning:       _ => token(prec(1, make_keyword("partitioning"))),
    keyword_linear:             _ => token(prec(1, make_keyword("linear"))),

    // Extend _alter_specifications to include MySQL partition management and
    // the online-DDL options ALGORITHM= / LOCK= (comma-separated trailing items).
    _alter_specifications: $ => choice(
      $.add_column,
      $.add_constraint,
      $.drop_constraint,
      $.alter_column,
      $.modify_column,
      $.change_column,
      $.drop_column,
      $.rename_object,
      $.rename_column,
      $.set_schema,
      $.change_ownership,
      $.alter_partition,
      $.alter_algorithm_option,
      $.alter_lock_option,
      // ALTER TABLE t ENGINE = InnoDB, AUTO_INCREMENT = 5, …
      // The same table_option list CREATE TABLE takes.
      $.table_option,
    ),

    // ALGORITHM [=] {DEFAULT | INSTANT | INPLACE | COPY | NOCOPY}
    alter_algorithm_option: $ => seq(
      $.keyword_algorithm,
      optional('='),
      choice($.keyword_default, $.identifier),
    ),

    // LOCK [=] {DEFAULT | NONE | SHARED | EXCLUSIVE}
    alter_lock_option: $ => seq(
      $.keyword_lock,
      optional('='),
      choice($.keyword_default, $.identifier),
    ),

    // Override statement to include MySQL procedural constructs
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        $._transaction_statement,
        $.compound_statement,
        $.if_statement,
        $.while_statement,
        $.repeat_statement,
        $.loop_statement,
        $.leave_statement,
        $.iterate_statement,
        $.return_statement,
        $.call_statement,
        $.set_variable_statement,
        $.signal_statement,
        $.resignal_statement,
        $.get_diagnostics_statement,
        $.declare_statement,
        $.declare_cursor_statement,
        $.open_cursor_statement,
        $.fetch_cursor_statement,
        $.close_cursor_statement,
        $.declare_condition_statement,
        $.declare_handler_statement,
        $.case_statement,
        // grammar/admin_ddl.js
        $.do_statement,
        $.handler_statement,
        $.import_table_statement,
        $.load_xml_statement,
        $.lock_tables_statement,
        $.unlock_tables_statement,
        $.lock_instance_statement,
        $.clone_statement,
        $.help_statement,
        $.install_statement,
        $.uninstall_statement,
        $.checksum_table_statement,
        $.flush_statement,
        $.kill_statement,
        $.reset_statement,
        $.restart_statement,
      ),
    ),

    // Override procedure_body to accept MySQL compound_statement (no ATOMIC keyword)
    procedure_body: $ => choice(
      $.compound_statement,
      seq($.keyword_as, alias($._single_quote_string, $.literal)),
    ),

    ...mysql_create_rules,
    ...mysql_optimize_rules,
    ...mysql_load_data_rules,
    ...mysql_events_rules,
    ...mysql_procedural_rules,
    ...mysql_partition_rules,
    ...mysql_admin_rules,
    ...mysql_admin_ddl_rules,
    // last, so its overrides win over the inherited rules
    ...mysql_clause_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_attribute: _ => token(prec(1, make_keyword("attribute"))),
    keyword_straight_join: _ => token(prec(1, make_keyword("straight_join"))),
    keyword_algorithm: _ => token(prec(1, make_keyword("algorithm"))),

    // ── Keywords for the clause completions in grammar/clauses.js ──────────
    // All appear mid-statement, after a keyword rather than after a name, so
    // they stay extracted.
    keyword_copy:        _ => make_keyword("copy"),
    keyword_encryption:  _ => make_keyword("encryption"),
    keyword_exclusive:   _ => make_keyword("exclusive"),
    keyword_inplace:     _ => make_keyword("inplace"),
    // prec(1): OPTION is a prefix of OPTIONALLY and is valid in the same
    // states, so the shorter token wins without this.
    keyword_optionally:  _ => token(prec(1, make_keyword("optionally"))),
    keyword_shared:      _ => make_keyword("shared"),
    keyword_sql:         _ => make_keyword("sql"),
    keyword_starting:    _ => make_keyword("starting"),
    keyword_temptable:   _ => make_keyword("temptable"),
    keyword_undefined:   _ => make_keyword("undefined"),
    keyword_atomic: _ => token(prec(1, make_keyword("atomic"))),
    keyword_called: _ => token(prec(1, make_keyword("called"))),
    keyword_repeatable: _ => token(prec(1, make_keyword("repeatable"))),
    keyword_errors:         _ => token(prec(1, make_keyword("errors"))),

    // ── Keywords for the statements in grammar/admin_ddl.js ────────────────
    keyword_server:      _ => token(prec(1, make_keyword("server"))),
    keyword_options:     _ => token(prec(1, make_keyword("options"))),
    keyword_undo:        _ => token(prec(1, make_keyword("undo"))),
    keyword_datafile:    _ => token(prec(1, make_keyword("datafile"))),
    keyword_undofile:    _ => token(prec(1, make_keyword("undofile"))),
    keyword_logfile:     _ => token(prec(1, make_keyword("logfile"))),
    keyword_spatial:     _ => token(prec(1, make_keyword("spatial"))),
    keyword_reference:   _ => token(prec(1, make_keyword("reference"))),
    keyword_resource:    _ => token(prec(1, make_keyword("resource"))),
    keyword_import:      _ => token(prec(1, make_keyword("import"))),
    keyword_concurrent:  _ => token(prec(1, make_keyword("concurrent"))),
    keyword_prev:        _ => token(prec(1, make_keyword("prev"))),
    keyword_instance:    _ => token(prec(1, make_keyword("instance"))),
    keyword_backup:      _ => token(prec(1, make_keyword("backup"))),
    keyword_clone:       _ => token(prec(1, make_keyword("clone"))),
    keyword_directory:   _ => token(prec(1, make_keyword("directory"))),
    keyword_require:     _ => token(prec(1, make_keyword("require"))),
    keyword_ssl:         _ => token(prec(1, make_keyword("ssl"))),
    keyword_help:        _ => token(prec(1, make_keyword("help"))),
    keyword_install:     _ => token(prec(1, make_keyword("install"))),
    keyword_uninstall:   _ => token(prec(1, make_keyword("uninstall"))),
    keyword_plugin:      _ => token(prec(1, make_keyword("plugin"))),
    keyword_component:   _ => token(prec(1, make_keyword("component"))),
    keyword_soname:      _ => token(prec(1, make_keyword("soname"))),
    keyword_checksum:    _ => token(prec(1, make_keyword("checksum"))),
    keyword_flush:       _ => token(prec(1, make_keyword("flush"))),
    keyword_export:      _ => token(prec(1, make_keyword("export"))),
    keyword_kill:        _ => token(prec(1, make_keyword("kill"))),
    keyword_shutdown:    _ => token(prec(1, make_keyword("shutdown"))),

    // Lexer-precedence guards: each of these is a strict prefix of a longer
    // keyword above/below, and explicit precedence beats match length, so the
    // longer form has to be re-declared at the same precedence to stay
    // lexable in this dialect.
    keyword_concurrently: _ => token(prec(1, make_keyword("concurrently"))),
    keyword_references:   _ => token(prec(1, make_keyword("references"))),

  },
}));
