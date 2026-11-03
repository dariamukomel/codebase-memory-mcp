import base from '../grammar.js';
import { optional_parenthesis, paren_list, comma_list, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import { createStatementChoices } from './grammar/legacy_statements.js';
import { fromClause } from '../grammar/statements/select.js';
import hana_statement_rules from './grammar/statements.js';
import hana_admin_rules from './grammar/admin.js';
import hana_regexpr_rules from './grammar/regexpr.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

// SAP HANA SQL; standalone lineage (SQLScript is HANA's own procedural
// language; the Sybase heritage is wire-level, not syntactic), extends the
// ANSI base. Adds COLUMN/ROW tables, UPSERT, WITH HINT, and SQLScript
// procedures with :param references.
export default canonicalOrder(grammar(base, {
  name: 'hana_sql',

  // conflicts do not propagate from the parent; base's list is copied
  // verbatim.
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
    // BEGIN … ; is ambiguous between a transaction block and a SQLScript
    // compound statement until END/COMMIT disambiguates (same as db2)
    [$.transaction, $.compound_statement],
    [$.transaction, $._sqlscript_statement],
    // TABLE GROUP: after CREATE/ALTER/DROP TABLE, GROUP is an extracted
    // keyword and so is also a legal table name, which one token of lookahead
    // cannot separate.
    [$.create_table, $.table_group_statement],
    [$.alter_table, $.table_group_statement],
    [$.drop_table, $.table_group_statement],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // Re-add non-ANSI CREATE forms this dialect supports over the strict ANSI base.
    _create_statement: $ => seq(choice(...createStatementChoices($, { materializedView: true, index: true }))),

    // LIMIT is supported (HANA has no ANSI OFFSET…FETCH FIRST paging).
    from: $ => fromClause($, { limit: true, offsetFetch: false }),

    // SELECT TOP n … row limiting.
    select: $ => seq(
      $.keyword_select,
      optional(seq($.keyword_top, alias($._integer, $.literal))),
      optional($.keyword_distinct),
      $.select_expression,
    ),

    keyword_top: _ => token(prec(1, make_keyword("top"))),

    // ALTER TABLE t ADD (col type, …): HANA requires the parenthesized list.
    add_column: $ => choice(
      seq(
        optional($.keyword_add),
        optional($.keyword_column),
        optional($._if_not_exists),
        $.column_definition,
        optional($.column_position),
      ),
      seq($.keyword_add, paren_list($.column_definition, true)),
    ),

    // base _alter_specifications plus HANA's table-level attributes:
    //   ALTER TABLE t UNLOAD PRIORITY 5
    //   ALTER TABLE t {ENABLE | DISABLE} DELTA LOG
    //   ALTER TABLE t PERSISTENT MEMORY {ON | OFF}
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
      seq($.keyword_unload, $.keyword_priority, field('priority', $.literal)),
      seq(choice($.keyword_enable, $.keyword_disable), $.keyword_delta, $.keyword_log),
      seq($.keyword_persistent, $.keyword_memory, choice($.keyword_on, $.keyword_off)),
    ),

    // base statement dispatch plus HANA statement forms; WITH HINT is wired
    // on query statements (its main HANA use) to avoid trailing-WITH
    // ambiguity with GRANT/type clauses
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        prec.right(seq(
          optional_parenthesis($._dml_read),
          optional($.with_hint_clause),
        )),
        $._transaction_statement,
        $.upsert_statement,
        $.compound_statement,
        $.declare_cursor_statement,
        // grammar/admin.js
        $.lock_table_statement,
        $.merge_delta_statement,
        $.load_unload_statement,
        $.refresh_object_statement,
        $.rename_object_statement,
        $.set_schema_statement,
        $.alter_system_statement,
        $.validate_statement,
        $.annotate_statement,
        $.cancel_async_call_statement,
        $.call_statement,
        $.connect_statement,
        $.export_statement,
        $.import_statement,
        $.unset_statement,
        $.do_statement,
      ),
    ),

    // SAP HANA SQLScript cursor: DECLARE CURSOR name FOR <select> (ISO E121,
    // CURSOR-first order, unlike the ANSI name-first form).
    declare_cursor_statement: $ => seq(
      $.keyword_declare,
      $.keyword_cursor,
      field('name', $.identifier),
      $.keyword_for,
      $._dml_read,
    ),

    // base DDL dispatch plus COMMENT ON (HANA supports COMMENT ON TABLE/COLUMN/VIEW).
    // Full re-enumeration: an override replaces the base rule entirely.
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
      // grammar/admin.js
      $.hana_object_statement,
      $.table_group_statement,
    ),

    // base alter_sequence plus HANA's RESET BY <subquery> tail.
    alter_sequence: $ => seq(
      $.keyword_alter,
      $.keyword_sequence,
      optional($._if_exists),
      $.object_reference,
      choice(
        repeat1(
          choice(
            seq($.keyword_as, $._type),
            seq($.keyword_increment, optional($.keyword_by), $.literal),
            seq($.keyword_minvalue, choice($.literal, seq($.keyword_no, $.keyword_minvalue))),
            seq($.keyword_maxvalue, choice($.literal, seq($.keyword_no, $.keyword_maxvalue))),
            seq($.keyword_start, optional($.keyword_with), field('start', $.literal)),
            seq($.keyword_restart, optional($.keyword_with), field('restart', $.literal)),
            seq($.keyword_cache, field('cache', $.literal)),
            seq(optional($.keyword_no), $.keyword_cycle),
            seq($.keyword_owned, $.keyword_by, choice($.keyword_none, $.object_reference)),
          ),
        ),
        $.rename_object,
        $.change_ownership,
        seq(
          $.keyword_set,
          choice(
            choice($.keyword_logged, $.keyword_unlogged),
            seq($.keyword_schema, $.identifier),
          ),
        ),
      ),
      optional(seq($.keyword_reset, $.keyword_by, $._dml_read)),
    ),

    // CREATE SCHEMA s [OWNED BY user]
    create_schema: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_schema,
      optional($._if_not_exists),
      field('name', $.object_reference),
      optional(seq($.keyword_owned, $.keyword_by, field('owner', $.identifier))),
    )),

    // TRUNCATE TABLE t [PARTITION (id, …)]
    _truncate_statement: $ => seq(
      $.keyword_truncate,
      optional($.keyword_table),
      optional($.keyword_only),
      comma_list($.object_reference),
      optional(seq($.keyword_partition, paren_list($.literal, true))),
    ),

    // base parameter plus HANA :name SQLScript variable references
    parameter: _ => /\?|(\$[0-9]+)|(:[a-zA-Z_][a-zA-Z0-9_]*)/,

    // HANA-specific keywords (dialect-level per AGENTS.md)
    keyword_upsert:    _ => token(prec(1, make_keyword("upsert"))),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    // prec-1 rather than plain make_keyword: an extracted keyword loses to
    // the word token wherever an identifier is also legal, which at statement
    // start would leave every one of these statements unparsed.
    keyword_lock:        _ => token(prec(1, make_keyword("lock"))),
    keyword_mode:        _ => token(prec(1, make_keyword("mode"))),
    keyword_exclusive:   _ => token(prec(1, make_keyword("exclusive"))),
    keyword_share:       _ => token(prec(1, make_keyword("share"))),
    keyword_delta:       _ => token(prec(1, make_keyword("delta"))),
    keyword_load:        _ => token(prec(1, make_keyword("load"))),
    keyword_unload:      _ => token(prec(1, make_keyword("unload"))),
    // ALTER TABLE table-attribute vocabulary.
    keyword_priority:    _ => token(prec(1, make_keyword("priority"))),
    keyword_log:         _ => token(prec(1, make_keyword("log"))),
    // keyword_log at prec(1) would shadow base keyword_logged (precedence
    // beats match length); re-declare it at equal precedence, the same guard
    // teradata uses.
    keyword_logged:      _ => token(prec(1, make_keyword("logged"))),
    keyword_persistent:  _ => token(prec(1, make_keyword("persistent"))),
    keyword_memory:      _ => token(prec(1, make_keyword("memory"))),
    keyword_off:         _ => token(prec(1, make_keyword("off"))),
    // keyword_off is a strict prefix of keyword_offset; same guard.
    keyword_offset:      _ => token(prec(1, make_keyword("offset"))),
    keyword_statistics:  _ => token(prec(1, make_keyword("statistics"))),
    keyword_pse:         _ => token(prec(1, make_keyword("pse"))),
    keyword_vector:      _ => token(prec(1, make_keyword("vector"))),
    keyword_audit:       _ => token(prec(1, make_keyword("audit"))),
    keyword_policy:      _ => token(prec(1, make_keyword("policy"))),
    keyword_credential:  _ => token(prec(1, make_keyword("credential"))),
    keyword_certificate: _ => token(prec(1, make_keyword("certificate"))),
    keyword_synonym:     _ => token(prec(1, make_keyword("synonym"))),
    keyword_workload:    _ => token(prec(1, make_keyword("workload"))),
    keyword_class:       _ => token(prec(1, make_keyword("class"))),
    keyword_mapping:     _ => token(prec(1, make_keyword("mapping"))),
    keyword_usergroup:   _ => token(prec(1, make_keyword("usergroup"))),
    keyword_rolegroup:   _ => token(prec(1, make_keyword("rolegroup"))),
    keyword_jwt:         _ => token(prec(1, make_keyword("jwt"))),
    keyword_ldap:        _ => token(prec(1, make_keyword("ldap"))),

    // ── Keywords for the clause-level pass over the SQL Reference ──────────
    keyword_part:          _ => token(prec(1, make_keyword("part"))),
    keyword_anonymization: _ => token(prec(1, make_keyword("anonymization"))),
    keyword_assertion:     _ => token(prec(1, make_keyword("assertion"))),
    keyword_rebuild:       _ => token(prec(1, make_keyword("rebuild"))),
    keyword_online:        _ => token(prec(1, make_keyword("online"))),
    keyword_preferred:     _ => token(prec(1, make_keyword("preferred"))),
    keyword_loadable:      _ => token(prec(1, make_keyword("loadable"))),
    keyword_remove:        _ => token(prec(1, make_keyword("remove"))),
    keyword_page:          _ => token(prec(1, make_keyword("page"))),

    // Lexer-precedence guards: PART is a strict prefix of these, and explicit
    // precedence beats match length, so each has to be re-declared here.
    keyword_partition:     _ => token(prec(1, make_keyword("partition"))),
    keyword_partitions:    _ => token(prec(1, make_keyword("partitions"))),
    keyword_partitioned:   _ => token(prec(1, make_keyword("partitioned"))),
    keyword_parameter:     _ => token(prec(1, make_keyword("parameter"))),
    keyword_saml:        _ => token(prec(1, make_keyword("saml"))),
    keyword_x509:        _ => token(prec(1, make_keyword("x509"))),
    keyword_provider:    _ => token(prec(1, make_keyword("provider"))),
    keyword_remote:      _ => token(prec(1, make_keyword("remote"))),
    keyword_source:      _ => token(prec(1, make_keyword("source"))),
    keyword_scheduler:   _ => token(prec(1, make_keyword("scheduler"))),
    keyword_job:         _ => token(prec(1, make_keyword("job"))),
    keyword_validate:    _ => token(prec(1, make_keyword("validate"))),
    keyword_annotate:    _ => token(prec(1, make_keyword("annotate"))),
    keyword_cancel:      _ => token(prec(1, make_keyword("cancel"))),
    keyword_async:       _ => token(prec(1, make_keyword("async"))),
    keyword_call:        _ => token(prec(1, make_keyword("call"))),
    keyword_connect:     _ => token(prec(1, make_keyword("connect"))),
    keyword_parameters:  _ => token(prec(1, make_keyword("parameters"))),
    keyword_unset:       _ => token(prec(1, make_keyword("unset"))),

    // Second pass: statements the vendor list showed were still missing.
    keyword_export:      _ => token(prec(1, make_keyword("export"))),
    keyword_import:      _ => token(prec(1, make_keyword("import"))),
    keyword_scan:        _ => token(prec(1, make_keyword("scan"))),
    keyword_rdf:         _ => token(prec(1, make_keyword("rdf"))),
    keyword_file:        _ => token(prec(1, make_keyword("file"))),
    keyword_sparql_graph: _ => token(prec(1, /[Ss][Pp][Aa][Rr][Qq][Ll]_[Gg][Rr][Aa][Pp][Hh]/)),
    keyword_purpose:     _ => token(prec(1, make_keyword("purpose"))),
    keyword_location:    _ => token(prec(1, make_keyword("location"))),
    keyword_at:          _ => token(prec(1, make_keyword("at"))),
    // Lexer-precedence guards: `at` above claims the front of both of these,
    // and BEGIN ATOMIC is this dialect's compound-statement header.
    keyword_atomic:      _ => token(prec(1, make_keyword("atomic"))),
    keyword_attribute:   _ => token(prec(1, make_keyword("attribute"))),

    // Lexer-precedence guards for the longer keywords whose prefixes the
    // tokens above now claim.
    keyword_called:      _ => token(prec(1, make_keyword("called"))),
    keyword_connection:  _ => token(prec(1, make_keyword("connection"))),
    keyword_locked:    _ => token(prec(1, make_keyword("locked"))),
    keyword_hint:      _ => token(prec(1, make_keyword("hint"))),
    keyword_sqlscript: _ => token(prec(1, make_keyword("sqlscript"))),
    keyword_invoker:   _ => token(prec(1, make_keyword("invoker"))),
    keyword_definer:   _ => token(prec(1, make_keyword("definer"))),
    keyword_reads:     _ => token(prec(1, make_keyword("reads"))),
    keyword_declare:   _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:    _ => token(prec(1, make_keyword("cursor"))),
    keyword_constant:  _ => token(prec(1, make_keyword("constant"))),
    keyword_inout:     _ => token(prec(1, make_keyword("inout"))),
    keyword_global:    _ => token(prec(1, make_keyword("global"))),
    keyword_sql:       _ => token(prec(1, make_keyword("sql"))),

    ...hana_statement_rules,
    ...hana_admin_rules,
    ...hana_regexpr_rules,

  },
}));
