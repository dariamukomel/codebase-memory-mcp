import base from '../grammar.js';
import { optional_parenthesis, comma_list, paren_list, make_keyword, wrapped_in_parenthesis, canonicalOrder } from '../grammar/helpers.js';
import db2_modules_rules from './grammar/modules.js';
import db2_data_control_rules from './grammar/data_control.js';
import db2_isolation_rules from './grammar/isolation.js';
import db2_special_register_rules from './grammar/special_registers.js';
import db2_diagnostics_rules from './grammar/diagnostics.js';
import db2_audit_rules from './grammar/audit.js';
import db2_procedural_rules from './grammar/procedural.js';
import db2_admin_ddl_rules from './grammar/admin.js';
import db2_clause_rules from './grammar/clauses.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'db2_sql',

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
    [$.from],
    [$.transaction, $.compound_statement],
    [$.set_variable_statement, $.object_reference],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // Extend _ddl_statement to add Db2-specific DDL
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      // Db2's SET SCHEMA is a statement in its own right. Base only ever
      // reaches set_schema as a clause of ALTER TABLE / ALTER VIEW, so at
      // statement level it was falling through to set_variable_statement.
      $.set_schema,
      $.transfer_ownership,
      $.signal_statement,
      $.resignal_statement,
      $.get_diagnostics_statement,
      $.grant_statement,
      $.revoke_statement,
      $.comment_statement,
      $.label_statement,
      // grammar/admin.js
      $.create_alias_statement,
      $.create_variable_statement,
    ),

    // DECLARE GLOBAL TEMPORARY TABLE name (cols) [ON COMMIT {PRESERVE|DELETE} ROWS] …
    declare_global_temporary_table: $ => seq(
      $.keyword_declare,
      $.keyword_global,
      $.keyword_temporary,
      $.keyword_table,
      $.object_reference,
      optional($.column_definitions),
      repeat(choice(
        seq($.keyword_on, $.keyword_commit, choice($.keyword_preserve, $.keyword_delete), $.keyword_rows),
        seq($.keyword_not, $.keyword_logged),
        seq($.keyword_with, $.keyword_replace),
      )),
    ),

    keyword_global: _ => token(prec(1, make_keyword("global"))),

    // CREATE TABLE … ORGANIZE BY {ROW | COLUMN | DIMENSIONS (cols) | (cols)}
    // BLU column-organized tables and multidimensional clustering (MDC).
    create_table: $ => prec.left(seq(
      $.keyword_create,
      optional($._temporary),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      seq(
        optional($.column_definitions),
        optional(seq($.keyword_as, $.create_query)),
      ),
      optional($.organize_by_clause),
    )),

    organize_by_clause: $ => seq(
      $.keyword_organize,
      $.keyword_by,
      choice(
        $.keyword_row,
        $.keyword_column,
        seq($.keyword_dimensions, wrapped_in_parenthesis(comma_list($.identifier, true))),
        wrapped_in_parenthesis(comma_list($.identifier, true)),
      ),
    ),

    keyword_organize:   _ => token(prec(1, make_keyword("organize"))),
    keyword_dimensions: _ => token(prec(1, make_keyword("dimensions"))),

    // LABEL ON {TABLE ref | COLUMN ref.col} IS 'string' (comment sibling)
    label_statement: $ => seq(
      $.keyword_label,
      $.keyword_on,
      choice(
        seq(optional($.keyword_table), $.object_reference),
        seq($.keyword_column, alias($._qualified_field, $.object_reference)),
      ),
      $.keyword_is,
      alias($._literal_string, $.literal),
    ),

    keyword_label: _ => token(prec(1, make_keyword("label"))),

    // Extend statement to add Db2 SQL PL procedural constructs
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
        $.declare_global_temporary_table,
        $.declare_statement,
        $.set_variable_statement,
        $.if_statement,
        $.while_statement,
        $.loop_statement,
        $.leave_statement,
        $.iterate_statement,
        $.repeat_statement,
        $.pipe_statement,
        $.declare_section_statement,
        $.datalake_table_statement,
        $.declare_cursor_statement,
        $.open_cursor_statement,
        $.fetch_cursor_statement,
        $.close_cursor_statement,
        $.for_statement,
        $.prepare_statement,
        $.execute_statement,
        // grammar/admin.js
        $.lock_table_statement,
        $.call_statement,
        $.refresh_table_statement,
        $.set_integrity_statement,
        $.flush_statement,
        $.free_locator_statement,
        $.describe_statement,
        $.execute_immediate_statement,
        $.connect_statement,
        $.disconnect_statement,
        $.audit_statement,
        $.whenever_statement,
        $.goto_statement,
        $.allocate_cursor_statement,
        $.associate_locators_statement,
        $.reorg_statement,
      ),
    ),

    // REORG TABLE t [INDEX i] [ALLOW {NO|READ|WRITE} ACCESS]
    // REORG INDEXES ALL FOR TABLE t [ALLOW …]
    // Db2's storage-reorganisation command: a utility, but one that is issued
    // as SQL text (directly or through SYSPROC.ADMIN_CMD).
    reorg_statement: $ => prec.left(seq(
      $.keyword_reorg,
      choice(
        seq(
          $.keyword_table,
          field('table', $.object_reference),
          optional(seq($.keyword_index, field('index', $.object_reference))),
        ),
        seq(
          $.keyword_indexes,
          $.keyword_all,
          $.keyword_for,
          $.keyword_table,
          field('table', $.object_reference),
        ),
      ),
      optional(seq(
        $.keyword_allow,
        choice($.keyword_no, $.keyword_read, $.keyword_write),
        $.keyword_access,
      )),
    )),

    // base _alter_specifications plus Db2's table-attribute actions:
    //   ALTER TABLE t APPEND {ON | OFF}
    //   ALTER TABLE t {VOLATILE | NOT VOLATILE}
    //   ALTER TABLE t ACTIVATE NOT LOGGED INITIALLY
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
      seq($.keyword_append, choice($.keyword_on, $.keyword_off)),
      seq(optional($.keyword_not), $.keyword_volatile),
      seq($.keyword_activate, $.keyword_not, $.keyword_logged, $.keyword_initially),
    ),

    // Extend _create_statement to add Db2-specific CREATE statements.
    // No CREATE MATERIALIZED VIEW: Db2 spells this as a materialized query
    // table on CREATE TABLE (… DATA INITIALLY DEFERRED REFRESH DEFERRED).
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
        $.create_wrapper,
        $.create_server,
        $.create_nickname,
        $.create_module,
        $.create_mask,
        $.create_permission,
        $.create_audit_policy,
        $.create_security_label,
        $.create_security_policy,
        $.create_security_label_component,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    // ── Label-based access control (LBAC) ───────────────────────────────────
    // CREATE SECURITY LABEL policy.label
    //   COMPONENT c1 'v' [, 'v' …] [, COMPONENT c2 'v' …]
    // One flat comma-separated list rather than a list of lists: nesting two
    // comma lists leaves the ',' after an element ambiguous between
    // continuing the elements and starting the next COMPONENT clause, which
    // tree-sitter cannot resolve. Here every ',' is shifted by the same rule
    // and the token after it (COMPONENT vs a string) decides.
    create_security_label: $ => seq(
      $.keyword_create,
      $.keyword_security,
      $.keyword_label,
      field('name', $.object_reference),
      $._security_label_component,
      repeat(seq(',', choice(
        $._security_label_component,
        field('element', alias($._literal_string, $.literal)),
      ))),
    ),

    _security_label_component: $ => seq(
      $.keyword_component,
      field('component', $.identifier),
      field('element', alias($._literal_string, $.literal)),
    ),

    // CREATE SECURITY POLICY p COMPONENTS c1 [, c2 …] WITH DB2LBACRULES
    //   [{RESTRICT | OVERRIDE} NOT AUTHORIZED WRITE SECURITY LABEL]
    create_security_policy: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_security,
      $.keyword_policy,
      field('name', $.identifier),
      $.keyword_components,
      comma_list(field('component', $.identifier), true),
      $.keyword_with,
      field('ruleset', $.identifier),
      optional(seq(
        choice($.keyword_restrict, $.keyword_override),
        $.keyword_not,
        $.keyword_authorized,
        $.keyword_write,
        $.keyword_security,
        $.keyword_label,
      )),
    )),

    // CREATE SECURITY LABEL COMPONENT c {ARRAY | SET | TREE} (…)
    // The element list is component-type specific; parsed as an expression
    // list rather than three separate shapes.
    create_security_label_component: $ => seq(
      $.keyword_create,
      $.keyword_security,
      $.keyword_label,
      $.keyword_component,
      field('name', $.identifier),
      choice($.keyword_array, $.keyword_set, $.keyword_tree),
      paren_list($._expression, true),
    ),

    // Extend _drop_statement to add DROP AUDIT POLICY
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
        $.drop_audit_policy,
      ),
    ),

    // Extend set_statement to add SET CURRENT SCHEMA = value

    // ── Keywords for the clause completions in grammar/clauses.js ──────────
    // Most appear mid-statement only and stay extracted (prec 0). The
    // reserved ones sit where an identifier is also legal in the same parse
    // state; the second word of a two-word TRANSFER OWNERSHIP object kind,
    // the sensitivity in DECLARE CURSOR; and an extracted keyword loses to
    // the word token there. PARTITION, EXTENSION and GROUP below are
    // reserved for the same reason.
    keyword_age:          _ => make_keyword("age"),
    keyword_asensitive:   _ => token(prec(1, make_keyword("asensitive"))),
    keyword_caller:       _ => make_keyword("caller"),
    keyword_capture:      _ => make_keyword("capture"),
    keyword_changes:      _ => make_keyword("changes"),
    keyword_client:       _ => make_keyword("client"),
    keyword_compress:     _ => token(prec(1, make_keyword("compress"))),
    keyword_current_user: _ => token(prec(1, make_keyword("current_user"))),
    keyword_cursors:      _ => token(prec(1, make_keyword("cursors"))),
    keyword_hierarchy:    _ => token(prec(1, make_keyword("hierarchy"))),
    keyword_insensitive:  _ => token(prec(1, make_keyword("insensitive"))),
    keyword_locks:        _ => token(prec(1, make_keyword("locks"))),
    keyword_mapping:      _ => token(prec(1, make_keyword("mapping"))),
    keyword_method:       _ => make_keyword("method"),
    keyword_modification: _ => make_keyword("modification"),
    keyword_query:        _ => make_keyword("query"),
    keyword_retain:       _ => make_keyword("retain"),
    keyword_scope:        _ => make_keyword("scope"),
    keyword_session_user: _ => token(prec(1, make_keyword("session_user"))),
    keyword_system_user:  _ => token(prec(1, make_keyword("system_user"))),
    keyword_tracking:     _ => make_keyword("tracking"),
    keyword_xsrobject:    _ => make_keyword("xsrobject"),
    keyword_yes:          _ => make_keyword("yes"),
    keyword_extension:    _ => token(prec(1, make_keyword("extension"))),
    keyword_partition:    _ => token(prec(1, make_keyword("partition"))),
    keyword_group:        _ => token(prec(1, make_keyword("group"))),
    // Lexer-precedence guards: `group` above claims the front of both of
    // these, and precedence is compared before match length.
    keyword_grouping:     _ => token(prec(1, make_keyword("grouping"))),
    keyword_groups:       _ => token(prec(1, make_keyword("groups"))),
    // SET SCHEMA competes with set_variable_statement, whose target is an
    // identifier; extracted SCHEMA loses to the word token there, so the
    // statement was never reachable.
    keyword_schema:       _ => token(prec(1, make_keyword("schema"))),
    // SET SCHEMA also accepts a plain name, so an identifier is legal in the
    // same position as these three and they would otherwise lose to it.
    keyword_user:         _ => token(prec(1, make_keyword("user"))),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    // These must be token(prec(1, …)), not plain make_keyword. The base
    // grammar sets `word: $ => $._identifier`, so an unprefixed keyword is
    // extracted; and an extracted keyword loses to the word token wherever
    // an identifier is also legal. In this dialect an identifier is legal at
    // statement start, so every statement-initial extracted keyword lexed as
    // an identifier and the statements did not parse at all.
    keyword_lock:           _ => token(prec(1, make_keyword("lock"))),
    keyword_mode:           _ => token(prec(1, make_keyword("mode"))),
    keyword_share:          _ => token(prec(1, make_keyword("share"))),
    keyword_exclusive:      _ => token(prec(1, make_keyword("exclusive"))),
    keyword_call:           _ => token(prec(1, make_keyword("call"))),
    keyword_incremental:    _ => token(prec(1, make_keyword("incremental"))),
    keyword_allow:          _ => token(prec(1, make_keyword("allow"))),
    keyword_access:         _ => token(prec(1, make_keyword("access"))),
    keyword_storage:        _ => token(prec(1, make_keyword("storage"))),
    keyword_reuse:          _ => token(prec(1, make_keyword("reuse"))),
    keyword_triggers:       _ => token(prec(1, make_keyword("triggers"))),
    keyword_continue:       _ => token(prec(1, make_keyword("continue"))),
    keyword_identity:       _ => token(prec(1, make_keyword("identity"))),
    keyword_flush:          _ => token(prec(1, make_keyword("flush"))),
    keyword_package:        _ => token(prec(1, make_keyword("package"))),
    keyword_cache:          _ => token(prec(1, make_keyword("cache"))),
    keyword_dynamic:        _ => token(prec(1, make_keyword("dynamic"))),
    keyword_event:          _ => token(prec(1, make_keyword("event"))),
    keyword_monitor:        _ => token(prec(1, make_keyword("monitor"))),
    keyword_buffer:         _ => token(prec(1, make_keyword("buffer"))),
    keyword_bufferpools:    _ => token(prec(1, make_keyword("bufferpools"))),
    keyword_federated:      _ => token(prec(1, make_keyword("federated"))),
    keyword_authentication: _ => token(prec(1, make_keyword("authentication"))),
    keyword_optimization:   _ => token(prec(1, make_keyword("optimization"))),
    keyword_profile:        _ => token(prec(1, make_keyword("profile"))),
    keyword_free:           _ => token(prec(1, make_keyword("free"))),
    keyword_locator:        _ => token(prec(1, make_keyword("locator"))),
    keyword_describe:       _ => token(prec(1, make_keyword("describe"))),
    keyword_output:         _ => token(prec(1, make_keyword("output"))),
    keyword_connect:        _ => token(prec(1, make_keyword("connect"))),
    keyword_disconnect:     _ => token(prec(1, make_keyword("disconnect"))),
    keyword_sql:            _ => token(prec(1, make_keyword("sql"))),
    keyword_alias:          _ => token(prec(1, make_keyword("alias"))),
    keyword_variable:       _ => token(prec(1, make_keyword("variable"))),
    keyword_constant:       _ => token(prec(1, make_keyword("constant"))),
    keyword_checked:        _ => token(prec(1, make_keyword("checked"))),
    keyword_unchecked:      _ => token(prec(1, make_keyword("unchecked"))),
    keyword_off:            _ => token(prec(1, make_keyword("off"))),
    keyword_integrity:      _ => token(prec(1, make_keyword("integrity"))),

    // Second pass: statements the vendor list showed were still missing.
    // `go`/`goto` and `locator`/`locators` sit at the same precedence as each
    // other, so match length decides between them.
    keyword_whenever:       _ => token(prec(1, make_keyword("whenever"))),
    keyword_sqlerror:       _ => token(prec(1, make_keyword("sqlerror"))),
    keyword_sqlwarning:     _ => token(prec(1, make_keyword("sqlwarning"))),
    keyword_found:          _ => token(prec(1, make_keyword("found"))),
    keyword_goto:           _ => token(prec(1, make_keyword("goto"))),
    keyword_go:             _ => token(prec(1, make_keyword("go"))),
    keyword_allocate:       _ => token(prec(1, make_keyword("allocate"))),
    keyword_associate:      _ => token(prec(1, make_keyword("associate"))),
    keyword_locators:       _ => token(prec(1, make_keyword("locators"))),
    keyword_result:         _ => token(prec(1, make_keyword("result"))),
    keyword_exception:      _ => token(prec(1, make_keyword("exception"))),
    keyword_trusted:        _ => token(prec(1, make_keyword("trusted"))),
    keyword_context:        _ => token(prec(1, make_keyword("context"))),
    keyword_remove:         _ => token(prec(1, make_keyword("remove"))),

    // Lexer-precedence guards: each of these is a longer keyword whose first
    // characters are now claimed by a prec-1 token above. Precedence beats
    // match length, so they have to be re-declared at the same precedence.
    keyword_called:         _ => token(prec(1, make_keyword("called"))),
    keyword_connection:     _ => token(prec(1, make_keyword("connection"))),
    keyword_offset:         _ => token(prec(1, make_keyword("offset"))),
    keyword_sqlstate:       _ => token(prec(1, make_keyword("sqlstate"))),

    set_statement: $ => seq(
      $.keyword_set,
      choice(
        seq($.keyword_constraints, choice($.keyword_all, comma_list($.identifier, true)), choice($.keyword_deferred, $.keyword_immediate)),
        seq($.keyword_transaction, $._transaction_mode),
        seq($.keyword_transaction, $.keyword_snapshot, $._transaction_mode),
        seq($.keyword_session, $.keyword_characteristics, $.keyword_as, $.keyword_transaction, $._transaction_mode),
        seq($.special_register, '=', $._expression),
        seq($.object_reference, '=', $._expression),
      ),
    ),

    // Db2: SELECT … FROM FINAL/NEW/OLD TABLE (INSERT/UPDATE/DELETE …)
    // (data-change-table-reference; Db2's mechanism for returning modified rows)
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
          $.data_change_table_reference,
        ),
        optional($.temporal_clause),
        optional($.tablesample),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // FOR {SYSTEM_TIME | BUSINESS_TIME} {AS OF t | BETWEEN t AND t | FROM t TO t}
    temporal_clause: $ => seq(
      $.keyword_for,
      choice($.keyword_system_time, $.keyword_business_time),
      choice(
        seq($.keyword_as, $.keyword_of, $._expression),
        seq($.keyword_between, $._expression, $.keyword_and, $._expression),
        seq($.keyword_from, $._expression, $.keyword_to, $._expression),
      ),
    ),

    keyword_system_time:   _ => token(prec(1, /[Ss][Yy][Ss][Tt][Ee][Mm]_[Tt][Ii][Mm][Ee]/)),
    keyword_business_time: _ => token(prec(1, /[Bb][Uu][Ss][Ii][Nn][Ee][Ss][Ss]_[Tt][Ii][Mm][Ee]/)),

    data_change_table_reference: $ => seq(
      choice(
        seq($.keyword_final, $.keyword_table),
        seq($.keyword_new, $.keyword_table),
        seq($.keyword_old, $.keyword_table),
      ),
      wrapped_in_parenthesis(
        choice(
          $.insert,
          $.update,
          seq($.delete, alias($._delete_from, $.from)),
        ),
      ),
    ),

    // Extend FROM to support OPTIMIZE FOR n ROWS and WITH isolation level at end
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
      optional($.group_by),
      optional($.having),
      optional($.window_clause),
      optional($.order_by),
      // Db2 paging is FETCH FIRST; no LIMIT keyword.
      optional($.offset_fetch_clause),
      optional($.optimize_for_clause),
      optional($.with_isolation_clause),
    ),

    // Db2-specific keywords; token(prec(1,...)) needed so lexer prefers
    // these over base _identifier when both are valid in the same state.
    keyword_prepare:    _ => token(prec(1, make_keyword("prepare"))),
    keyword_final:      _ => token(prec(1, make_keyword("final"))),
    keyword_wrapper:    _ => token(prec(1, make_keyword("wrapper"))),
    keyword_nickname:   _ => token(prec(1, make_keyword("nickname"))),
    keyword_module:     _ => token(prec(1, make_keyword("module"))),
    keyword_server:     _ => token(prec(1, make_keyword("server"))),
    keyword_mask:       _ => token(prec(1, make_keyword("mask"))),
    keyword_permission: _ => token(prec(1, make_keyword("permission"))),
    keyword_transfer:   _ => token(prec(1, make_keyword("transfer"))),
    keyword_ownership:  _ => token(prec(1, make_keyword("ownership"))),
    keyword_enforced:   _ => token(prec(1, make_keyword("enforced"))),
    keyword_ur:         _ => token(prec(1, make_keyword("ur"))),
    keyword_cs:         _ => token(prec(1, make_keyword("cs"))),
    keyword_rs:         _ => token(prec(1, make_keyword("rs"))),
    keyword_rr:         _ => token(prec(1, make_keyword("rr"))),
    keyword_preserve:   _ => token(prec(1, make_keyword("preserve"))),
    keyword_path:       _ => token(prec(1, make_keyword("path"))),
    keyword_audit:      _ => token(prec(1, make_keyword("audit"))),
    keyword_categories: _ => token(prec(1, make_keyword("categories"))),
    keyword_status:     _ => token(prec(1, make_keyword("status"))),
    keyword_both:       _ => token(prec(1, make_keyword("both"))),
    keyword_failure:    _ => token(prec(1, make_keyword("failure"))),
    keyword_success:    _ => token(prec(1, make_keyword("success"))),
    keyword_value:      _ => token(prec(1, make_keyword("value"))),
    // keyword_value's explicit prec(1) outranks the base keyword_values token
    // (precedence beats match length in the lexer), which broke INSERT … VALUES.
    // Re-declare keyword_values at the same precedence so longest-match wins.
    keyword_values:     _ => token(prec(1, make_keyword("values"))),
    keyword_do:         _ => token(prec(1, make_keyword("do"))),
    keyword_leave:      _ => token(prec(1, make_keyword("leave"))),
    keyword_iterate:    _ => token(prec(1, make_keyword("iterate"))),

    // ── Keywords for REPEAT, PIPE, DECLARE SECTION and DATALAKE ────────────
    keyword_repeat:       _ => token(prec(1, make_keyword("repeat"))),
    keyword_pipe:         _ => token(prec(1, make_keyword("pipe"))),
    keyword_datalake:     _ => token(prec(1, make_keyword("datalake"))),
    keyword_stored:       _ => token(prec(1, make_keyword("stored"))),
    keyword_location:     _ => token(prec(1, make_keyword("location"))),
    keyword_partitioned:  _ => token(prec(1, make_keyword("partitioned"))),
    keyword_tblproperties: _ => token(prec(1, make_keyword("tblproperties"))),
    keyword_format:       _ => token(prec(1, make_keyword("format"))),

    // Lexer-precedence guard: REPEAT is a strict prefix of REPEATABLE, and
    // explicit precedence beats match length, so the longer word has to be
    // re-declared at the same precedence to stay lexable.
    keyword_repeatable:   _ => token(prec(1, make_keyword("repeatable"))),
    keyword_loop:       _ => token(prec(1, make_keyword("loop"))),
    keyword_elseif:     _ => token(prec(1, make_keyword("elseif"))),
    keyword_while:      _ => token(prec(1, make_keyword("while"))),
    keyword_declare:    _ => token(prec(1, make_keyword("declare"))),
    keyword_atomic:     _ => token(prec(1, make_keyword("atomic"))),
    keyword_signal:         _ => token(prec(1, make_keyword("signal"))),
    keyword_resignal:       _ => token(prec(1, make_keyword("resignal"))),
    keyword_message_text:   _ => token(prec(1, make_keyword("message_text"))),
    keyword_get:            _ => token(prec(1, make_keyword("get"))),
    keyword_diagnostics:    _ => token(prec(1, make_keyword("diagnostics"))),
    keyword_optimize:       _ => token(prec(1, make_keyword("optimize"))),
    keyword_options:        _ => token(prec(1, make_keyword("options"))),
    keyword_version:        _ => token(prec(1, make_keyword("version"))),
    keyword_policy:         _ => token(prec(1, make_keyword("policy"))),
    // ── LBAC and table-maintenance vocabulary ──────────────────────────────
    // COMPONENT is a strict prefix of COMPONENTS: both stay at prec(1) so
    // longest-match decides which one a given word is.
    keyword_component:      _ => token(prec(1, make_keyword("component"))),
    keyword_components:     _ => token(prec(1, make_keyword("components"))),
    keyword_override:       _ => token(prec(1, make_keyword("override"))),
    keyword_authorized:     _ => token(prec(1, make_keyword("authorized"))),
    keyword_tree:           _ => token(prec(1, make_keyword("tree"))),
    keyword_append:         _ => token(prec(1, make_keyword("append"))),
    keyword_activate:       _ => token(prec(1, make_keyword("activate"))),
    keyword_reorg:          _ => token(prec(1, make_keyword("reorg"))),
    keyword_indexes:        _ => token(prec(1, make_keyword("indexes"))),
    keyword_cursor:         _ => token(prec(1, make_keyword("cursor"))),
    keyword_open:           _ => token(prec(1, make_keyword("open"))),
    keyword_close:          _ => token(prec(1, make_keyword("close"))),
    keyword_hold:           _ => token(prec(1, make_keyword("hold"))),

    ...db2_modules_rules,
    ...db2_data_control_rules,
    ...db2_isolation_rules,
    ...db2_special_register_rules,
    ...db2_diagnostics_rules,
    ...db2_audit_rules,
    ...db2_procedural_rules,
    ...db2_admin_ddl_rules,
    // last, so its overrides win over the inherited rules
    ...db2_clause_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_double: _ => token(prec(1, make_keyword("double"))),

  },
}));
