import base from '../grammar.js';
import { optional_parenthesis, comma_list, paren_list, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import tsql_select_rules from './grammar/select.js';
import tsql_type_rules from './grammar/types.js';
import tsql_hint_rules from './grammar/hints.js';
import tsql_dml_rules from './grammar/dml.js';
import tsql_procedural_rules from './grammar/procedural.js';
import tsql_synapse_rules from './grammar/synapse.js';
import tsql_security_rules from './grammar/security.js';
import tsql_database_rules from './grammar/database.js';
import tsql_admin_rules   from './grammar/admin.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'tsql',

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
    // output_clause's trailing optional paren column list after INTO <target>
    // is now resolved statically by prec.right on the rule itself (see
    // tsql/grammar/dml.js), so the [$.output_clause] GLR self-conflict is gone.
    // EXPLAIN followed by keyword_continue / keyword_break is ambiguous; resolved by tree-sitter
    // [$.statement] removed (tree-sitter reported it unnecessary)
    // [$.option_clause] removed: tree-sitter reports it unnecessary; the
    // close-paren ambiguity it was added for is resolved by prec.right on
    // _dml_read above.
    [$._function_return, $.return_statement],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // ── Program / batch separator ─────────────────────────────────────────────
    // T-SQL uses ';' OR 'GO' as statement terminators.  Both are optional after
    // the last statement (same as base).
    program: $ => seq(
      repeat(
        seq(
          choice($.transaction, $.statement),
          choice(';', $.keyword_go),
        ),
      ),
      optional(choice($.transaction, $.statement)),
    ),

    // ── Statement ─────────────────────────────────────────────────────────────
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
        // T-SQL has no ANSI SAVEPOINT / RELEASE SAVEPOINT / ROLLBACK TO
        // SAVEPOINT; it uses SAVE TRANSACTION instead, so the base
        // _transaction_statement family is deliberately not wired in here.
        $.save_transaction_statement,
        // T-SQL procedural constructs
        $.declare_statement,
        $.if_statement,
        $.while_statement,
        $.compound_statement,
        $.try_catch_statement,
        $.raiserror_statement,
        $.throw_statement,
        $.print_statement,
        // T-SQL BULK INSERT (DML data-loading)
        $.bulk_insert_statement,
        // T-SQL loop control
        $.keyword_break,
        $.keyword_continue,
        // T-SQL cursor lifecycle
        $.declare_cursor_statement,
        $.open_cursor_statement,
        $.fetch_cursor_statement,
        $.close_cursor_statement,
        $.deallocate_cursor_statement,
        // New: EXEC/EXECUTE, RETURN, WAITFOR
        $.exec_statement,
        $.return_statement,
        $.waitfor_statement,
        // grammar/admin.js
        $.set_option_statement,
        $.execute_as_statement,
        $.revert_statement,
        $.setuser_statement,
        $.enable_trigger_statement,
        $.update_statistics_statement,
        $.backup_statement,
        $.open_key_statement,
        $.sensitivity_classification_statement,
      ),
    ),

    // ── _dml_read: add trailing OPTION clause ─────────────────────────────────
    _dml_read: $ => prec.right(seq(
      optional(optional_parenthesis($._cte)),
      optional_parenthesis(
        choice(
          $._select_statement,
          $.set_operation,
        ),
      ),
      optional($.option_clause),
    )),

    // ── DDL dispatch ─────────────────────────────────────────────────────────
    // ALTER INDEX {name | ALL} ON table
    //   {REBUILD [PARTITION = n] [WITH (opt = val, …)] | REORGANIZE
    //    | DISABLE | RESUME | PAUSE | ABORT | SET (opt = val, …)}
    // A T-SQL-only spelling: base's alter_index has no ON clause.
    alter_index_statement: $ => prec.right(seq(
      $.keyword_alter,
      $.keyword_index,
      choice(field('name', $.identifier), $.keyword_all),
      $.keyword_on,
      field('table', $.object_reference),
      choice(
        seq(
          $.keyword_rebuild,
          optional(seq($.keyword_partition, '=', field('partition', $.literal))),
          optional(seq($.keyword_with, paren_list($.index_option, true))),
        ),
        $.keyword_reorganize,
        $.keyword_disable,
        $.keyword_resume,
        $.keyword_pause,
        $.keyword_abort,
        seq($.keyword_set, paren_list($.index_option, true)),
      ),
    )),

    index_option: $ => seq(
      field('name', $.identifier),
      '=',
      field('value', choice($.literal, $.identifier, $.keyword_on, $.keyword_off)),
    ),

    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.copy_into_statement,
      $.grant_statement,
      $.revoke_statement,
      $.use_statement,
      $.create_synonym_statement,
      $.drop_synonym_statement,
      $.alter_index_statement,
      $.create_login_statement,
      $.alter_login_statement,
      $.drop_login_statement,
      $.create_user_statement,
      $.alter_user_statement,
      $.drop_user_statement,
      $.comment_statement,
      // grammar/admin.js
      $.deny_statement,
      $.create_statistics,
      $.create_key_object,
      $.create_partition_function,
      $.create_partition_scheme,
      $.create_security_policy,
      $.create_default_or_rule,
      $.create_principal_role,
      $.drop_tsql_object,
    ),

    // ── CREATE dispatch ───────────────────────────────────────────────────────
    // CREATE MATERIALIZED VIEW is Azure Synapse dedicated-SQL-pool syntax
    // (this dialect covers Synapse; see grammar/synapse.js). Box-standard
    // SQL Server uses indexed views instead, but both share this grammar.
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
        $.create_external_data_source,
        $.create_external_file_format,
        $.create_external_table,
        $.create_shortcut,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    // ALTER TABLE t SET (LOCK_ESCALATION = AUTO); the table-option list,
    // spelled with the same option entries CREATE TABLE's WITH (…) accepts.
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
      seq($.keyword_set, '(', comma_list($.table_with_option, true), ')'),
    ),

    // ── CREATE TABLE with optional Synapse WITH (...) ────────────────────────
    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional(choice($._temporary, $.keyword_external)),
        $.keyword_table,
        optional($._if_not_exists),
        field("target", $.object_reference),
        optional($.column_definitions),
        optional($.table_with_options),
        optional(seq($.keyword_as, $.create_query)),
      ),
    ),

    // ── Identifier; add [bracket] and #temp/##global forms ──────────────────
    // T-SQL allows [schema].[table].[column] with square-bracket quoting and
    // #temp / ##global temp table prefixes.
    identifier: $ => choice(
      $._identifier,
      $.dynamic_identifier,
      $.dynamic_composite_identifier,
      $._double_quote_string,
      $._tsql_quoted_identifier,
    ),

    // [bracket] and #temp / ##global identifiers share a single token. Their
    // patterns are disjoint ('[' vs '#') and both surface as a hidden child of
    // (identifier), so one terminal produces byte-identical trees while removing
    // a duplicate, always-identical action-table column (bracket and temp
    // carried the same ACTIONS entry in every identifier-expecting state);
    // shrinking the generated table on tsql, the heaviest grammar.
    _tsql_quoted_identifier: _ => token(choice(
      /\[[^\]\n]*\]/,
      /##?[A-Za-z_][0-9A-Za-z_]*/,
    )),

    // ── @variable syntax ──────────────────────────────────────────────────────
    // Matches both @@system_var and @local_var.
    // token(prec(1,...)) ensures the lexer prefers this over the '@' entry in
    // op_unary_other when followed by an identifier character.
    variable: _ => token(prec(1, /@@?[A-Za-z_][A-Za-z0-9_]*/)),

    // ── Expression; add @variable ────────────────────────────────────────────
    _expression: $ => prec(1,
      choice(
        $.literal,
        alias($._qualified_field, $.field),
        $.parameter,
        $.variable,
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

    // ── T-SQL keywords ───────────────────────────────────────────────────────
    // All defined with token(prec(1,...)) so the lexer prefers them over
    // the base _identifier pattern in ambiguous parse states.
    keyword_top:              _ => token(prec(1, make_keyword("top"))),
    // CREATE / ALTER DATABASE vocabulary. Each follows a keyword rather
    // than a name, so they stay extracted.
    keyword_configuration:   _ => make_keyword("configuration"),
    keyword_containment:     _ => make_keyword("containment"),
    keyword_filegroup:       _ => token(prec(1, make_keyword("filegroup"))),
    keyword_name:            _ => make_keyword("name"),
    keyword_remove:          _ => make_keyword("remove"),
    keyword_output:           _ => token(prec(1, make_keyword("output"))),
    keyword_inserted:         _ => token(prec(1, make_keyword("inserted"))),
    keyword_deleted:          _ => token(prec(1, make_keyword("deleted"))),
    keyword_raiserror:        _ => token(prec(1, make_keyword("raiserror"))),
    keyword_throw:            _ => token(prec(1, make_keyword("throw"))),
    keyword_try:              _ => token(prec(1, make_keyword("try"))),
    keyword_catch:            _ => token(prec(1, make_keyword("catch"))),
    keyword_go:               _ => token(prec(1, make_keyword("go"))),
    keyword_bulk:             _ => token(prec(1, make_keyword("bulk"))),
    keyword_openrowset:       _ => token(prec(1, make_keyword("openrowset"))),
    keyword_nolock:           _ => token(prec(1, make_keyword("nolock"))),
    keyword_rowlock:          _ => token(prec(1, make_keyword("rowlock"))),
    keyword_updlock:          _ => token(prec(1, make_keyword("updlock"))),
    keyword_readpast:         _ => token(prec(1, make_keyword("readpast"))),
    keyword_tablock:          _ => token(prec(1, make_keyword("tablock"))),
    keyword_tablockx:         _ => token(prec(1, make_keyword("tablockx"))),
    keyword_datetime2:        _ => token(prec(1, make_keyword("datetime2"))),
    keyword_smalldatetime:    _ => token(prec(1, make_keyword("smalldatetime"))),
    keyword_money:            _ => token(prec(1, make_keyword("money"))),
    keyword_smallmoney:       _ => token(prec(1, make_keyword("smallmoney"))),
    keyword_uniqueidentifier: _ => token(prec(1, make_keyword("uniqueidentifier"))),
    keyword_pivot:            _ => token(prec(1, make_keyword("pivot"))),
    keyword_unpivot:          _ => token(prec(1, make_keyword("unpivot"))),
    keyword_apply:            _ => token(prec(1, make_keyword("apply"))),
    keyword_distribution:     _ => token(prec(1, make_keyword("distribution"))),
    keyword_round_robin:      _ => token(prec(1, make_keyword("round_robin"))),
    keyword_replicate:        _ => token(prec(1, make_keyword("replicate"))),
    keyword_shortcut:         _ => token(prec(1, make_keyword("shortcut"))),
    keyword_target:           _ => token(prec(1, make_keyword("target"))),
    keyword_print:            _ => token(prec(1, make_keyword("print"))),
    keyword_break:            _ => token(prec(1, make_keyword("break"))),
    keyword_log:              _ => token(prec(1, make_keyword("log"))),
    // ── Keywords for ALTER INDEX ──────────────────────────────────────────
    keyword_rebuild:          _ => token(prec(1, make_keyword("rebuild"))),
    keyword_reorganize:       _ => token(prec(1, make_keyword("reorganize"))),
    keyword_resume:           _ => token(prec(1, make_keyword("resume"))),
    keyword_pause:            _ => token(prec(1, make_keyword("pause"))),
    keyword_abort:            _ => token(prec(1, make_keyword("abort"))),
    keyword_seterror:         _ => token(prec(1, make_keyword("seterror"))),
    // Note: keyword_continue is already in base (BigQuery); redefine here
    // with higher precedence so T-SQL parse states treat it as a keyword.
    keyword_continue:         _ => token(prec(1, make_keyword("continue"))),
    keyword_hash:             _ => token(prec(1, make_keyword("hash"))),
    keyword_columnstore:      _ => token(prec(1, make_keyword("columnstore"))),
    keyword_heap:             _ => token(prec(1, make_keyword("heap"))),
    keyword_file:             _ => token(prec(1, make_keyword("file"))),
    keyword_format:           _ => token(prec(1, make_keyword("format"))),
    keyword_clustered:        _ => token(prec(1, make_keyword("clustered"))),
    keyword_copy:             _ => token(prec(1, make_keyword("copy"))),
    keyword_while:            _ => token(prec(1, make_keyword("while"))),
    keyword_source:           _ => token(prec(1, make_keyword("source"))),
    keyword_declare:          _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:           _ => token(prec(1, make_keyword("cursor"))),
    keyword_open:             _ => token(prec(1, make_keyword("open"))),
    keyword_close:            _ => token(prec(1, make_keyword("close"))),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    // MASTER / SYMMETRIC / ASYMMETRIC are deliberately absent: `USE master;`
    // is in the corpus and none of the three is reserved in T-SQL, so those
    // words stay identifiers (see grammar/admin.js).
    keyword_deny:             _ => token(prec(1, make_keyword("deny"))),
    keyword_control:          _ => token(prec(1, make_keyword("control"))),
    keyword_revert:           _ => token(prec(1, make_keyword("revert"))),
    keyword_caller:           _ => token(prec(1, make_keyword("caller"))),
    keyword_cookie:           _ => token(prec(1, make_keyword("cookie"))),
    keyword_setuser:          _ => token(prec(1, make_keyword("setuser"))),
    keyword_statistics:       _ => token(prec(1, make_keyword("statistics"))),
    keyword_partitions:       _ => token(prec(1, make_keyword("partitions"))),
    keyword_backup:           _ => token(prec(1, make_keyword("backup"))),
    keyword_restore:          _ => token(prec(1, make_keyword("restore"))),
    keyword_certificate:      _ => token(prec(1, make_keyword("certificate"))),
    keyword_credential:       _ => token(prec(1, make_keyword("credential"))),
    keyword_scoped:           _ => token(prec(1, make_keyword("scoped"))),
    keyword_encryption:       _ => token(prec(1, make_keyword("encryption"))),
    keyword_decryption:       _ => token(prec(1, make_keyword("decryption"))),
    keyword_scheme:           _ => token(prec(1, make_keyword("scheme"))),
    keyword_security:         _ => token(prec(1, make_keyword("security"))),
    keyword_policy:           _ => token(prec(1, make_keyword("policy"))),
    keyword_predicate:        _ => token(prec(1, make_keyword("predicate"))),
    keyword_block:            _ => token(prec(1, make_keyword("block"))),
    keyword_replication:      _ => token(prec(1, make_keyword("replication"))),
    keyword_rule:             _ => token(prec(1, make_keyword("rule"))),
    keyword_sensitivity:      _ => token(prec(1, make_keyword("sensitivity"))),
    keyword_classification:   _ => token(prec(1, make_keyword("classification"))),
    keyword_server:           _ => token(prec(1, make_keyword("server"))),
    keyword_application:      _ => token(prec(1, make_keyword("application"))),
    keyword_deallocate:       _ => token(prec(1, make_keyword("deallocate"))),
    keyword_insensitive:      _ => token(prec(1, make_keyword("insensitive"))),
    keyword_scroll:           _ => token(prec(1, make_keyword("scroll"))),
    keyword_global:           _ => token(prec(1, make_keyword("global"))),
    keyword_forward_only:     _ => token(prec(1, make_keyword("forward_only"))),
    keyword_static:           _ => token(prec(1, make_keyword("static"))),
    keyword_keyset:           _ => token(prec(1, make_keyword("keyset"))),
    keyword_dynamic:          _ => token(prec(1, make_keyword("dynamic"))),
    keyword_fast_forward:     _ => token(prec(1, make_keyword("fast_forward"))),
    keyword_scroll_locks:     _ => token(prec(1, make_keyword("scroll_locks"))),
    keyword_optimistic:       _ => token(prec(1, make_keyword("optimistic"))),
    keyword_type_warning:     _ => token(prec(1, make_keyword("type_warning"))),
    keyword_absolute:         _ => token(prec(1, make_keyword("absolute"))),
    keyword_relative:         _ => token(prec(1, make_keyword("relative"))),
    keyword_prior:            _ => token(prec(1, make_keyword("prior"))),
    keyword_read_only:        _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Oo][Nn][Ll][Yy]/)),
    keyword_exec:             _ => token(prec(1, make_keyword("exec"))),
    keyword_execute:          _ => token(prec(1, make_keyword("execute"))),
    keyword_save:             _ => token(prec(1, make_keyword("save"))),
    // T-SQL abbreviates TRANSACTION to TRAN (BEGIN/COMMIT/ROLLBACK/SAVE TRAN).
    // Matched as ONE token with an optional tail; a separate keyword_tran
    // would shadow the TRAN prefix of TRANSACTION, because tree-sitter weighs
    // lexical precedence before match length. Same idiom as teradata's SEL.
    keyword_transaction:      _ => /[Tt][Rr][Aa][Nn]([Ss][Aa][Cc][Tt][Ii][Oo][Nn])?/,
    keyword_return:           _ => token(prec(1, make_keyword("return"))),
    keyword_waitfor:          _ => token(prec(1, make_keyword("waitfor"))),
    keyword_delay:            _ => token(prec(1, make_keyword("delay"))),
    keyword_timeout:          _ => token(prec(1, make_keyword("timeout"))),
    keyword_option:           _ => token(prec(1, make_keyword("option"))),
    keyword_synonym:          _ => token(prec(1, make_keyword("synonym"))),
    keyword_off:              _ => token(prec(1, make_keyword("off"))),
    keyword_login:            _ => token(prec(1, make_keyword("login"))),
    keyword_must_change:      _ => token(prec(1, /[Mm][Uu][Ss][Tt]_[Cc][Hh][Aa][Nn][Gg][Ee]/)),

    // ── Column constraints; add IDENTITY and computed AS … PERSISTED ────────
    // Re-enumerates the base _column_constraint alternatives (a dialect override
    // replaces the base rule entirely) and appends the two T-SQL forms:
    //   id INT IDENTITY(seed, increment)
    //   total AS (qty * price) PERSISTED
    _column_constraint: $ => prec.left(choice(
      choice($.keyword_null, $._not_null),
      seq(
        $.keyword_references,
        $.object_reference,
        paren_list($.identifier, true),
        repeat(seq(
          $.keyword_on,
          choice($.keyword_delete, $.keyword_update),
          choice(
            seq($.keyword_no, $.keyword_action),
            $.keyword_restrict,
            $.keyword_cascade,
            seq($.keyword_set, choice($.keyword_null, $.keyword_default), optional(paren_list($.identifier, true))),
          ),
        )),
      ),
      $._default_expression,
      $._primary_key,
      $.direction,
      $._column_comment,
      $._check_constraint,
      // Identity column: IDENTITY [(seed, increment)]
      seq(
        $.keyword_identity,
        optional(wrapped_in_parenthesis(seq(
          alias($._integer, $.literal),
          ',',
          alias($._integer, $.literal),
        ))),
      ),
      $.keyword_unique,
    )),

    keyword_identity:  _ => token(prec(1, make_keyword("identity"))),
    keyword_persisted: _ => token(prec(1, make_keyword("persisted"))),

    // T-SQL user-defined types: table-valued (AS TABLE (…)) and alias (FROM type).
    create_type: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_type,
      $.object_reference,
      choice(
        seq($.keyword_as, $.keyword_table, $.column_definitions),
        seq($.keyword_from, $._type, optional(choice($.keyword_null, $._not_null))),
      ),
    )),

    // Computed columns have no data type: `total AS (qty * price) [PERSISTED]`.
    // The base column_definition requires a type, so re-enumerate it here and
    // add the type-less computed form.
    column_definition: $ => prec.left(choice(
      seq(
        field('name', $._column),
        field('type', $._type),
        repeat($._column_constraint),
      ),
      seq(
        field('name', $._column),
        $.keyword_as,
        field('expression', $._expression),
        optional($.keyword_persisted),
      ),
    )),

    // Select-list variable assignment: SELECT @v = expr [, …]
    term: $ => choice(
      seq(field('variable', $.variable), '=', field('value', $._expression)),
      seq(
        field('value', choice($.all_fields, $._expression)),
        optional($._alias),
      ),
    ),

    // T-SQL SET @variable = expression  (plus base transaction/constraint SET)
    set_statement: $ => prec.right(choice(
      seq($.keyword_set, $.variable, '=', $._expression),
      seq($.keyword_set, $.keyword_constraints, choice($.keyword_all, comma_list($.identifier, true)), choice($.keyword_deferred, $.keyword_immediate)),
      seq($.keyword_set, $.keyword_transaction, $._transaction_mode),
      seq($.keyword_set, $.keyword_transaction, $.keyword_snapshot, $._transaction_mode),
      seq($.keyword_set, $.keyword_session, $.keyword_characteristics, $.keyword_as, $.keyword_transaction, $._transaction_mode),
    )),

    // SAVE { TRAN | TRANSACTION } { savepoint_name | @savepoint_variable }
    // T-SQL's savepoint form; it has no ANSI SAVEPOINT statement.
    save_transaction_statement: $ => seq(
      $.keyword_save,
      $.keyword_transaction,
      field('name', choice($.identifier, $.variable)),
    ),

    // ROLLBACK { TRAN | TRANSACTION } [ name | @var ]; an explicit name rolls
    // back to that savepoint rather than the whole transaction. T-SQL spells
    // this without the ANSI "TO SAVEPOINT".
    _rollback: $ => seq(
      $.keyword_rollback,
      optional(choice($.keyword_transaction, $.keyword_work)),
      optional(field('name', choice($.identifier, $.variable))),
    ),

    ...tsql_admin_rules,
    ...tsql_select_rules,
    ...tsql_type_rules,
    ...tsql_hint_rules,
    ...tsql_dml_rules,
    ...tsql_procedural_rules,
    ...tsql_synapse_rules,
    ...tsql_security_rules,
    // last, so its overrides win over the inherited rules
    ...tsql_database_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_logged: _ => token(prec(1, make_keyword("logged"))),
    keyword_offset: _ => token(prec(1, make_keyword("offset"))),
    keyword_returning: _ => token(prec(1, make_keyword("returning"))),
    keyword_returns: _ => token(prec(1, make_keyword("returns"))),

  },
}));
