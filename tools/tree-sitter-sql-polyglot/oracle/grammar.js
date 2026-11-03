import base from '../grammar.js';
import { optional_parenthesis, comma_list, paren_list, make_keyword, wrapped_in_parenthesis, canonicalOrder } from '../grammar/helpers.js';
import oracle_match_recognize_rules from './grammar/match_recognize.js';
import oracle_hierarchical_rules from './grammar/hierarchical.js';
import oracle_plsql_rules from './grammar/plsql_blocks.js';
import oracle_bulk_rules from './grammar/bulk_ops.js';
import oracle_merge_rules from './grammar/merge_ext.js';
import oracle_cursor_rules from './grammar/cursor.js';
import oracle_package_rules from './grammar/package.js';
import oracle_procedural_rules from './grammar/procedural.js';
import oracle_type_rules from './grammar/types.js';
import oracle_hint_rules from './grammar/hints.js';
import oracle_partition_rules from './grammar/partition.js';
import oracle_admin_rules from './grammar/admin.js';
import oracle_ddl_ext_rules from './grammar/ddl_ext.js';
import oracle_admin_ddl_rules from './grammar/admin_ddl.js';
import oracle_mview_rules from './grammar/mviews.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'oracle_sql',

  precedences: $ => [
    [
      'binary_is',
      'unary_not',
      'binary_exp',
      'binary_times',
      'binary_plus',
      'unary_other',
      'unary_prior',
      'binary_other',
      'binary_in',
      'binary_compare',
      'binary_relation',
      'pattern_matching',
      'between',
      'clause_connective',
      'clause_disjunctive',
    ],
  ],

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
    [$.assignment_statement, $._qualified_field],
    [$._function_return, $.return_statement],
    [$.cursor_for_loop, $.for_statement],
    [$.pragma_statement, $._qualified_field],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // Extend _create_statement to add CREATE PACKAGE / PACKAGE BODY / SYNONYM / DATABASE LINK
    _create_statement: $ => seq(
      choice(
        $.create_table,
        $.create_view,
        $.create_materialized_view,
        $.create_index,
        $.create_function,
        $.create_procedure,
        $.create_type,
        $.create_database,
        $.create_role,
        $.create_sequence,
        $.create_trigger,
        $.create_package,
        $.create_package_body,
        $.create_synonym_statement,
        $.create_database_link_statement,
        $.create_materialized_view_log,
        $.create_materialized_zonemap,
        $.create_directory_statement,
        $.create_operator,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    // Extend _drop_statement to add DROP PACKAGE / SYNONYM
    _drop_statement: $ => seq(
      choice(
        $.drop_table,
        $.drop_view,
        $.drop_materialized_view,
        $.drop_index,
        $.drop_type,
        $.drop_schema,
        $.drop_database,
        $.drop_role,
        $.drop_sequence,
        $.drop_function,
        $.drop_procedure,
        $.drop_package,
        $.drop_synonym_statement,
        $.drop_database_link_statement,
        $.drop_materialized_view_log,
        $.drop_materialized_zonemap,
        $.drop_directory_statement,
      ),
    ),

    // Extend statement to add PL/SQL blocks, FORALL, EXECUTE IMMEDIATE, cursors,
    // Oracle: COMMENT ON is supported (re-enumerates base _ddl_statement)
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.grant_statement,
      $.revoke_statement,
      $.comment_statement,
      // grammar/mviews.js
      $.alter_database_link_statement,
      $.alter_materialized_view_log,
      $.alter_materialized_zonemap,
      // grammar/admin_ddl.js
      $.restore_point_statement,
      $.create_cluster_statement,
      $.truncate_cluster_statement,
      $.drop_cluster_statement,
      $.context_statement,
    ),

    // procedural control-flow (IF/WHILE/LOOP/FOR/RETURN/EXIT/CONTINUE/NULL/ASSIGN)
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
        $.forall_statement,
        $.execute_immediate_statement,
        $.cursor_for_loop,
        $.cursor_open_statement,
        $.cursor_fetch_statement,
        $.cursor_close_statement,
        // Procedural control-flow
        $.if_statement,
        $.while_statement,
        $.loop_statement,
        $.for_statement,
        $.return_statement,
        $.exit_statement,
        $.continue_statement,
        $.null_statement,
        $.assignment_statement,
        $.pragma_statement,
        $.pipe_row_statement,
        $.alter_session_statement,
        $.alter_system_statement,
        $.analyze_statement,
        // grammar/admin_ddl.js
        $.lock_table_statement,
        $.purge_statement,
        $.flashback_statement,
        $.audit_policy_statement,
        $.associate_statistics_statement,
        $.explain_plan_statement,
        $.set_role_statement,
        $.call_statement,
      ),
    ),

    from: $ => seq(
      $.keyword_from,
      optional($.keyword_only),
      comma_list(field('relation', $.relation), true),
      repeat(
        choice(
          $.join,
          $.cross_join,
          $.lateral_join,
          $.lateral_cross_join,
        ),
      ),
      optional($.where),
      optional($.connect_by_clause),
      optional($.group_by),
      optional($.having),
      optional($.window_clause),
      optional($.model_clause),
      optional($.order_siblings_by),
      optional($.order_by),
      // Oracle paging is FETCH FIRST/ROWNUM; no LIMIT keyword.
      optional($.offset_fetch_clause),
    ),

    // Override relation to add FLASHBACK AS OF clause
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.json_table,
          $.xmltable,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.flashback_clause),
        optional($.tablesample),
        optional(choice($.pivot_clause, $.unpivot_clause)),
        optional($.match_recognize_clause),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // JSON_TABLE(expr, 'path' COLUMNS ( col type [PATH 'p'] [, …] ))
    json_table: $ => seq(
      $.keyword_json_table,
      '(',
      $._expression,
      ',',
      alias($._literal_string, $.literal),
      $.keyword_columns,
      '(',
      comma_list($.json_table_column, true),
      ')',
      ')',
    ),

    json_table_column: $ => seq(
      field('name', $.identifier),
      $._type,
      optional(seq($.keyword_path, alias($._literal_string, $.literal))),
    ),

    // XMLTABLE('xpath' [PASSING expr] COLUMNS col type [PATH 'p'] [, …])
    xmltable: $ => seq(
      $.keyword_xmltable,
      '(',
      alias($._literal_string, $.literal),
      optional(seq($.keyword_passing, $._expression)),
      $.keyword_columns,
      comma_list($.xmltable_column, true),
      ')',
    ),

    xmltable_column: $ => seq(
      field('name', $.identifier),
      $._type,
      optional(seq($.keyword_path, alias($._literal_string, $.literal))),
    ),

    keyword_json_table: _ => token(prec(1, make_keyword("json_table"))),
    keyword_xmltable:   _ => token(prec(1, make_keyword("xmltable"))),
    keyword_columns:    _ => token(prec(1, make_keyword("columns"))),
    keyword_path:       _ => token(prec(1, make_keyword("path"))),
    keyword_passing:    _ => token(prec(1, make_keyword("passing"))),

    // PIVOT ( agg [alias] [, …] FOR col IN ( value [alias] [, …] ) )
    pivot_clause: $ => seq(
      $.keyword_pivot,
      '(',
      comma_list(seq($.invocation, optional($._alias)), true),
      $.keyword_for,
      choice($.identifier, paren_list($.identifier, true)),
      $.keyword_in,
      paren_list(seq(
        choice(alias($._literal_string, $.literal), alias($._integer, $.literal), $.identifier),
        optional($._alias),
      ), true),
      ')',
    ),

    // UNPIVOT [INCLUDE|EXCLUDE NULLS] ( value_col FOR name_col IN ( col [, …] ) )
    unpivot_clause: $ => seq(
      $.keyword_unpivot,
      optional(seq(choice($.keyword_include, $.keyword_exclude), $.keyword_nulls)),
      '(',
      choice($.identifier, paren_list($.identifier, true)),
      $.keyword_for,
      choice($.identifier, paren_list($.identifier, true)),
      $.keyword_in,
      paren_list($.identifier, true),
      ')',
    ),

    keyword_pivot:   _ => token(prec(1, make_keyword("pivot"))),
    keyword_match_recognize: _ => token(prec(1, /[Mm][Aa][Tt][Cc][Hh]_[Rr][Ee][Cc][Oo][Gg][Nn][Ii][Zz][Ee]/)),
    keyword_pattern: _ => token(prec(1, make_keyword("pattern"))),
    keyword_define:  _ => token(prec(1, make_keyword("define"))),
    keyword_per:     _ => token(prec(1, make_keyword("per"))),
    keyword_past:    _ => token(prec(1, make_keyword("past"))),
    keyword_one:     _ => token(prec(1, make_keyword("one"))),
    keyword_match:   _ => token(prec(1, make_keyword("match"))),
    // Re-declare longer keywords that the prec(1) tokens above would otherwise
    // shadow (explicit precedence beats match length in the lexer).
    keyword_matched: _ => token(prec(1, make_keyword("matched"))),
    keyword_percent: _ => token(prec(1, make_keyword("percent"))),
    keyword_unpivot: _ => token(prec(1, make_keyword("unpivot"))),

    // Extend unary_expression to include Oracle PRIOR operator
    unary_expression: $ => choice(
      ...[
        [$.keyword_not, 'unary_not'],
        [$.bang, 'unary_not'],
        [$.keyword_any, 'unary_not'],
        [$.keyword_some, 'unary_not'],
        [$.keyword_all, 'unary_not'],
        [$.op_unary_other, 'unary_other'],
        [$.keyword_prior, 'unary_prior'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('operator', operator),
          field('operand', $._expression)
        ))
      ),
    ),

    // Override _expression to add Oracle date/timestamp literal forms (DATE '...' / TIMESTAMP '...')
    _expression: $ => prec(1, choice(
      $.literal,
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
      $.parenthesized_expression,
      $.trim_expression,
      $.date_literal,
      $.timestamp_literal,
      $.keep_aggregate,
    )),

    // FIRST/LAST aggregate: fn(args) KEEP (DENSE_RANK {FIRST|LAST} ORDER BY …)
    //   [OVER (…)]
    keep_aggregate: $ => seq(
      $.invocation,
      $.keyword_keep,
      '(',
      $.keyword_dense_rank,
      choice($.keyword_first, $.keyword_last),
      $.order_by,
      ')',
      optional(seq($.keyword_over, choice($.identifier, $.window_specification))),
    ),

    keyword_dense_rank:   _ => token(prec(1, make_keyword("dense_rank"))),
    keyword_organization: _ => token(prec(1, make_keyword("organization"))),
    keyword_heap:         _ => token(prec(1, make_keyword("heap"))),

    // Oracle-specific keywords; token(prec(1,...)) needed so lexer prefers
    // these over base _identifier when both are valid in the same state.
    keyword_exceptions:     _ => token(prec(1, make_keyword("exceptions"))),
    keyword_connect:        _ => token(prec(1, make_keyword("connect"))),
    keyword_prior:          _ => token(prec(1, make_keyword("prior"))),
    keyword_nocycle:        _ => token(prec(1, make_keyword("nocycle"))),
    keyword_siblings:       _ => token(prec(1, make_keyword("siblings"))),
    keyword_forall:         _ => token(prec(1, make_keyword("forall"))),
    keyword_bulk:           _ => token(prec(1, make_keyword("bulk"))),
    keyword_collect:        _ => token(prec(1, make_keyword("collect"))),
    keyword_indices:        _ => token(prec(1, make_keyword("indices"))),
    keyword_rowtype:        _ => token(prec(1, make_keyword("rowtype"))),
    keyword_save:           _ => token(prec(1, make_keyword("save"))),
    keyword_target:         _ => token(prec(1, make_keyword("target"))),
    keyword_rownum:         _ => token(prec(1, make_keyword("rownum"))),
    keyword_dual:           _ => token(prec(1, make_keyword("dual"))),
    keyword_cursor:         _ => token(prec(1, make_keyword("cursor"))),
    keyword_open:           _ => token(prec(1, make_keyword("open"))),
    keyword_fetch:          _ => token(prec(1, make_keyword("fetch"))),
    keyword_close:          _ => token(prec(1, make_keyword("close"))),
    keyword_package:        _ => token(prec(1, make_keyword("package"))),
    keyword_body:           _ => token(prec(1, make_keyword("body"))),
    keyword_editionable:    _ => token(prec(1, make_keyword("editionable"))),
    keyword_noneditionable: _ => token(prec(1, make_keyword("noneditionable"))),
    keyword_authid:         _ => token(prec(1, make_keyword("authid"))),
    keyword_pragma:         _ => token(prec(1, make_keyword("pragma"))),
    keyword_reverse:        _ => token(prec(1, make_keyword("reverse"))),
    keyword_continue:       _ => token(prec(1, make_keyword("continue"))),
    keyword_elsif:          _ => token(prec(1, make_keyword("elsif"))),
    keyword_exit:           _ => token(prec(1, make_keyword("exit"))),
    keyword_loop:           _ => token(prec(1, make_keyword("loop"))),
    keyword_exception:      _ => token(prec(1, make_keyword("exception"))),
    keyword_while:          _ => token(prec(1, make_keyword("while"))),
    keyword_source:         _ => token(prec(1, make_keyword("source"))),
    keyword_declare:        _ => token(prec(1, make_keyword("declare"))),
    keyword_current_user:   _ => token(prec(1, make_keyword("current_user"))),

    keyword_pipe:           _ => token(prec(1, make_keyword("pipe"))),

    // Oracle DDL extension keywords
    keyword_scn:            _ => token(prec(1, make_keyword("scn"))),
    keyword_synonym:        _ => token(prec(1, make_keyword("synonym"))),
    keyword_identified:     _ => token(prec(1, make_keyword("identified"))),
    keyword_link:           _ => token(prec(1, make_keyword("link"))),

    // Oracle type keywords
    keyword_number:         _ => token(prec(1, make_keyword("number"))),
    keyword_varchar2:       _ => token(prec(1, make_keyword("varchar2"))),
    keyword_nvarchar2:      _ => token(prec(1, make_keyword("nvarchar2"))),
    keyword_clob:           _ => token(prec(1, make_keyword("clob"))),
    keyword_nclob:          _ => token(prec(1, make_keyword("nclob"))),
    keyword_blob:           _ => token(prec(1, make_keyword("blob"))),
    keyword_bfile:          _ => token(prec(1, make_keyword("bfile"))),
    keyword_raw:            _ => token(prec(1, make_keyword("raw"))),
    keyword_long:           _ => token(prec(1, make_keyword("long"))),
    keyword_rowid:          _ => token(prec(1, make_keyword("rowid"))),
    keyword_urowid:         _ => token(prec(1, make_keyword("urowid"))),
    keyword_binary_float:   _ => token(prec(1, make_keyword("binary_float"))),
    keyword_binary_double:  _ => token(prec(1, make_keyword("binary_double"))),
    keyword_byte:           _ => token(prec(1, make_keyword("byte"))),
    keyword_year:           _ => token(prec(1, make_keyword("year"))),
    keyword_month:          _ => token(prec(1, make_keyword("month"))),
    keyword_day:            _ => token(prec(1, make_keyword("day"))),
    keyword_second:         _ => token(prec(1, make_keyword("second"))),

    // Oracle partition keywords
    keyword_list:           _ => token(prec(1, make_keyword("list"))),
    keyword_partitions:     _ => token(prec(1, make_keyword("partitions"))),
    keyword_subpartition:   _ => token(prec(1, make_keyword("subpartition"))),
    keyword_subpartitions:  _ => token(prec(1, make_keyword("subpartitions"))),
    keyword_less:           _ => token(prec(1, make_keyword("less"))),
    keyword_than:           _ => token(prec(1, make_keyword("than"))),
    keyword_split:          _ => token(prec(1, make_keyword("split"))),
    keyword_exchange:       _ => token(prec(1, make_keyword("exchange"))),
    keyword_at:             _ => token(prec(1, make_keyword("at"))),

    // Locking / MODEL / ALTER SYSTEM/SESSION / DIRECTORY / ANALYZE (#101, #107, #108, #111)
    keyword_skip:           _ => token(prec(1, make_keyword("skip"))),
    keyword_nav:            _ => token(prec(1, make_keyword("nav"))),
    keyword_keep:           _ => token(prec(1, make_keyword("keep"))),
    keyword_updated:        _ => token(prec(1, make_keyword("updated"))),
    keyword_dimension:      _ => token(prec(1, make_keyword("dimension"))),
    keyword_measures:       _ => token(prec(1, make_keyword("measures"))),
    keyword_rules:          _ => token(prec(1, make_keyword("rules"))),
    keyword_upsert:         _ => token(prec(1, make_keyword("upsert"))),
    keyword_sequential:     _ => token(prec(1, make_keyword("sequential"))),
    keyword_automatic:      _ => token(prec(1, make_keyword("automatic"))),
    keyword_iterate:        _ => token(prec(1, make_keyword("iterate"))),
    keyword_system:         _ => token(prec(1, make_keyword("system"))),
    keyword_scope:          _ => token(prec(1, make_keyword("scope"))),
    keyword_sid:            _ => token(prec(1, make_keyword("sid"))),
    keyword_memory:         _ => token(prec(1, make_keyword("memory"))),
    keyword_spfile:         _ => token(prec(1, make_keyword("spfile"))),
    keyword_flush:          _ => token(prec(1, make_keyword("flush"))),
    keyword_kill:           _ => token(prec(1, make_keyword("kill"))),
    keyword_checkpoint:     _ => token(prec(1, make_keyword("checkpoint"))),
    keyword_switch:         _ => token(prec(1, make_keyword("switch"))),
    keyword_logfile:        _ => token(prec(1, make_keyword("logfile"))),
    keyword_archive:        _ => token(prec(1, make_keyword("archive"))),
    keyword_log:            _ => token(prec(1, make_keyword("log"))),
    keyword_directory:      _ => token(prec(1, make_keyword("directory"))),
    keyword_compute:        _ => token(prec(1, make_keyword("compute"))),
    keyword_estimate:       _ => token(prec(1, make_keyword("estimate"))),
    keyword_validate:       _ => token(prec(1, make_keyword("validate"))),
    keyword_structure:      _ => token(prec(1, make_keyword("structure"))),
    keyword_sample:         _ => token(prec(1, make_keyword("sample"))),
    keyword_statistics:     _ => token(prec(1, make_keyword("statistics"))),

    // Override create_table to add optional partition clause
    create_table: $ => prec.left(seq(
      $.keyword_create,
      optional($._or_replace),
      optional($._temporary),
      $.keyword_table,
      optional($._if_not_exists),
      field('target', $.object_reference),
      seq(
        optional($.column_definitions),
        optional(seq($.keyword_as, $.create_query)),
      ),
      optional($.organization_clause),
      optional($.table_partition_by),
    )),

    // ORGANIZATION {HEAP | INDEX | EXTERNAL}; index-organized tables (IOT) etc.
    organization_clause: $ => seq(
      $.keyword_organization,
      choice($.keyword_heap, $.keyword_index, $.keyword_external),
    ),

    // Oracle trigger with a PL/SQL block body (base mandates the Postgres
    // EXECUTE FUNCTION tail instead).
    create_trigger: $ => seq(
      $.keyword_create,
      optional($._or_replace),
      $.keyword_trigger,
      $.object_reference,
      choice(
        $.keyword_before,
        $.keyword_after,
        seq($.keyword_instead, $.keyword_of),
      ),
      $._create_trigger_event,
      repeat(seq($.keyword_or, $._create_trigger_event)),
      $.keyword_on,
      $.object_reference,
      optional(seq($.keyword_for, $.keyword_each, $.keyword_row)),
      optional(seq($.keyword_when, wrapped_in_parenthesis($._expression))),
      $.compound_statement,
    ),

    // Override INSERT to add optional RETURNING INTO
    insert: $ => seq(
      $.keyword_insert,
      optional($.keyword_into),
      field('target', $.object_reference),
      optional(seq($.keyword_as, field('alias', $.identifier))),
      choice(
        $._insert_values,
        $._set_values,
      ),
      optional($.returning_into_clause),
    ),

    // Override UPDATE to add optional WHERE and RETURNING INTO
    update: $ => seq(
      $.keyword_update,
      optional($.keyword_only),
      field('target', $.relation),
      $._set_values,
      optional($.where),
      optional($.returning_into_clause),
    ),

    // Override _delete_statement to add optional RETURNING INTO
    _delete_statement: $ => seq(
      $.delete,
      alias($._oracle_delete_from, $.from),
    ),

    _oracle_delete_from: $ => seq(
      $.keyword_from,
      optional($.keyword_only),
      field('target', $.object_reference),
      optional($.where),
      optional($.returning_into_clause),
    ),

    // Extend _alter_specifications to include Oracle partition operations
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
      // ALTER TABLE t PCTFREE 10 | STORAGE (NEXT 1M) | NOLOGGING …
      // The physical-attributes clause, already defined for the materialized
      // view statements, is equally an ALTER TABLE action.
      $._oracle_physical_attribute,
    ),

    ...oracle_hierarchical_rules,
    ...oracle_plsql_rules,
    ...oracle_bulk_rules,
    ...oracle_merge_rules,
    ...oracle_cursor_rules,
    ...oracle_package_rules,
    ...oracle_procedural_rules,
    ...oracle_type_rules,
    ...oracle_hint_rules,
    ...oracle_partition_rules,
    ...oracle_ddl_ext_rules,
    ...oracle_admin_ddl_rules,
    ...oracle_mview_rules,
    ...oracle_admin_rules,
    ...oracle_match_recognize_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_attribute: _ => token(prec(1, make_keyword("attribute"))),
    keyword_atomic: _ => token(prec(1, make_keyword("atomic"))),
    keyword_connection: _ => token(prec(1, make_keyword("connection"))),
    keyword_logged: _ => token(prec(1, make_keyword("logged"))),
    keyword_savepoint: _ => token(prec(1, make_keyword("savepoint"))),

    // ── Keywords for the statements in grammar/admin_ddl.js ────────────────
    keyword_lock:         _ => token(prec(1, make_keyword("lock"))),
    keyword_mode:         _ => token(prec(1, make_keyword("mode"))),
    keyword_share:        _ => token(prec(1, make_keyword("share"))),
    keyword_exclusive:    _ => token(prec(1, make_keyword("exclusive"))),
    keyword_purge:        _ => token(prec(1, make_keyword("purge"))),
    keyword_flashback:    _ => token(prec(1, make_keyword("flashback"))),
    keyword_restore:      _ => token(prec(1, make_keyword("restore"))),
    keyword_point:        _ => token(prec(1, make_keyword("point"))),
    keyword_cluster:      _ => token(prec(1, make_keyword("cluster"))),
    keyword_size:         _ => token(prec(1, make_keyword("size"))),
    keyword_storage:      _ => token(prec(1, make_keyword("storage"))),
    keyword_reuse:        _ => token(prec(1, make_keyword("reuse"))),
    keyword_including:    _ => token(prec(1, make_keyword("including"))),
    keyword_constraints:  _ => token(prec(1, make_keyword("constraints"))),
    keyword_context:      _ => token(prec(1, make_keyword("context"))),
    keyword_audit:        _ => token(prec(1, make_keyword("audit"))),
    keyword_noaudit:      _ => token(prec(1, make_keyword("noaudit"))),
    keyword_policy:       _ => token(prec(1, make_keyword("policy"))),
    keyword_whenever:     _ => token(prec(1, make_keyword("whenever"))),
    keyword_successful:   _ => token(prec(1, make_keyword("successful"))),
    keyword_associate:    _ => token(prec(1, make_keyword("associate"))),
    keyword_disassociate: _ => token(prec(1, make_keyword("disassociate"))),
    keyword_selectivity:  _ => token(prec(1, make_keyword("selectivity"))),
    keyword_plan:         _ => token(prec(1, make_keyword("plan"))),
    keyword_call:         _ => token(prec(1, make_keyword("call"))),

    // ── Keywords for the statements in grammar/mviews.js ───────────────────
    // Materialized view, view log and zonemap vocabulary.
    keyword_build:        _ => token(prec(1, make_keyword("build"))),
    keyword_never:        _ => token(prec(1, make_keyword("never"))),
    keyword_fast:         _ => token(prec(1, make_keyword("fast"))),
    keyword_complete:     _ => token(prec(1, make_keyword("complete"))),
    keyword_demand:       _ => token(prec(1, make_keyword("demand"))),
    keyword_segment:      _ => token(prec(1, make_keyword("segment"))),
    keyword_prebuilt:     _ => token(prec(1, make_keyword("prebuilt"))),
    keyword_excluding:    _ => token(prec(1, make_keyword("excluding"))),
    keyword_zonemap:      _ => token(prec(1, make_keyword("zonemap"))),
    keyword_pruning:      _ => token(prec(1, make_keyword("pruning"))),
    keyword_rebuild:      _ => token(prec(1, make_keyword("rebuild"))),
    keyword_compile:      _ => token(prec(1, make_keyword("compile"))),
    keyword_consider:     _ => token(prec(1, make_keyword("consider"))),
    keyword_fresh:        _ => token(prec(1, make_keyword("fresh"))),
    keyword_rewrite:      _ => token(prec(1, make_keyword("rewrite"))),
    keyword_unusable:     _ => token(prec(1, make_keyword("unusable"))),
    keyword_monitoring:   _ => token(prec(1, make_keyword("monitoring"))),
    keyword_authenticated: _ => token(prec(1, make_keyword("authenticated"))),
    keyword_online:       _ => token(prec(1, make_keyword("online"))),
    keyword_pctfree:      _ => token(prec(1, make_keyword("pctfree"))),
    // CREATE DATABASE / CREATE OPERATOR vocabulary.
    keyword_national:     _ => token(prec(1, make_keyword("national"))),
    keyword_operator:     _ => token(prec(1, make_keyword("operator"))),
    keyword_binding:      _ => token(prec(1, make_keyword("binding"))),
    keyword_pctused:      _ => token(prec(1, make_keyword("pctused"))),
    keyword_initrans:     _ => token(prec(1, make_keyword("initrans"))),
    keyword_noparallel:   _ => token(prec(1, make_keyword("noparallel"))),
    keyword_nocache:      _ => token(prec(1, make_keyword("nocache"))),
    keyword_logging:      _ => token(prec(1, make_keyword("logging"))),
    keyword_nologging:    _ => token(prec(1, make_keyword("nologging"))),
    keyword_noreverse:    _ => token(prec(1, make_keyword("noreverse"))),

    // Left extracted rather than reserved: QUERY, MASTER and COALESCE are all
    // plausible identifiers, and each appears only in a position where no
    // identifier is legal, so the word token can never shadow them.
    keyword_query:        _ => make_keyword("query"),
    keyword_master:       _ => make_keyword("master"),
    keyword_coalesce:     _ => make_keyword("coalesce"),

    // Lexer-precedence guards: each keyword above is a strict prefix of one of
    // these, and tree-sitter resolves lexical precedence before match length,
    // so the longer form has to be re-declared at the same precedence to stay
    // lexable. `model` matters most; Oracle's MODEL clause depends on it.
    keyword_called:       _ => token(prec(1, make_keyword("called"))),
    keyword_locked:       _ => token(prec(1, make_keyword("locked"))),
    keyword_model:        _ => token(prec(1, make_keyword("model"))),
    keyword_shared:       _ => token(prec(1, make_keyword("shared"))),

  },
}));
