import base from '../grammar.js';
import { comma_list, optional_parenthesis, make_keyword, wrapped_in_parenthesis, canonicalOrder } from '../grammar/helpers.js';
import { createStatementChoices } from './grammar/legacy_statements.js';
import teradata_statement_rules from './grammar/statements.js';
import teradata_admin_rules from './grammar/admin.js';
import teradata_analysis_rules from './grammar/analysis.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

// Teradata SQL; standalone lineage (since 1979), extends the ANSI base.
// Adds SEL/DEL abbreviations, SET/MULTISET/VOLATILE tables, PRIMARY INDEX,
// RANGE_N/CASE_N partitioning, COLLECT STATISTICS, CREATE MACRO, TOP n,
// and QUALIFY.
export default canonicalOrder(grammar(base, {
  name: 'teradata_sql',

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
    // BLOCKCOMPRESSION=mode(…) option args vs the table's column list
    [$.table_option],
    // BEGIN … ; is ambiguous between a transaction block and a compound
    // statement until END/COMMIT disambiguates (same as db2/hana)
    [$.transaction, $.compound_statement],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // No TABLESAMPLE: Teradata uses its own SAMPLE clause (see `from` below),
    // not the ANSI TABLESAMPLE clause.
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // Re-add non-ANSI CREATE forms this dialect supports over the strict ANSI base.
    _create_statement: $ => seq(choice(
      ...createStatementChoices($, { index: true }),
      $.create_join_index,
      $.create_foreign_server,
    )),

    // CREATE FOREIGN SERVER name
    //   [EXTERNAL SECURITY {DEFINER | INVOKER} TRUSTED auth]
    //   USING option('value') …
    //   DO IMPORT WITH udf [, DO EXPORT WITH udf]
    // QueryGrid's remote-connection object. The USING options are
    // space-separated name('value') pairs with no commas, while the DO clauses
    // are comma-separated, which is why they are two different lists.
    create_foreign_server: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_foreign,
      $.keyword_server,
      field('name', $.identifier),
      optional(seq(
        $.keyword_external,
        $.keyword_security,
        choice($.keyword_definer, $.keyword_invoker),
        $.keyword_trusted,
        field('authorization', $.object_reference),
      )),
      optional(seq($.keyword_using, repeat1($.foreign_server_option))),
      comma_list($.foreign_server_action, true),
    )),

    foreign_server_option: $ => seq(
      field('name', $.identifier),
      '(',
      field('value', alias($._literal_string, $.literal)),
      ')',
    ),

    foreign_server_action: $ => seq(
      $.keyword_do,
      choice($.keyword_import, $.keyword_export),
      $.keyword_with,
      field('function', $.object_reference),
    ),

    keyword_server:  _ => token(prec(1, make_keyword("server"))),
    keyword_trusted: _ => token(prec(1, make_keyword("trusted"))),
    keyword_import:  _ => token(prec(1, make_keyword("import"))),
    keyword_export:  _ => token(prec(1, make_keyword("export"))),

    // CREATE {JOIN | HASH} INDEX name AS SELECT … [PRIMARY INDEX (…)]
    create_join_index: $ => prec.right(seq(
      $.keyword_create,
      choice($.keyword_join, $.keyword_hash),
      $.keyword_index,
      $.object_reference,
      optional($._if_not_exists),
      $.keyword_as,
      $.create_query,
      optional($.primary_index),
    )),

    keyword_hash: _ => token(prec(1, make_keyword("hash"))),

    // CREATE DATABASE db [FROM owner] AS PERM = n [BYTES], SPOOL = n, …
    // Teradata's space/attribute list, not the ANSI `WITH setting` tail the
    // base rule carries. CREATE USER shares the same option list.
    create_database: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_database,
      optional($._if_not_exists),
      field('name', $.identifier),
      optional(seq($.keyword_from, field('owner', $.identifier))),
      optional(seq($.keyword_as, comma_list($.database_option, true))),
    )),

    database_option: $ => choice(
      seq(
        choice($.keyword_permanent, $.keyword_perm, $.keyword_spool, $.keyword_temporary),
        '=',
        $._expression,
        optional($.keyword_bytes),
      ),
      seq($.keyword_account, '=', $.literal),
      seq($.keyword_default, $.keyword_map, '=', $.identifier),
      // The protection/journalling attributes a database shares with a table.
      seq(optional($.keyword_no), $.keyword_fallback, optional($.keyword_protection)),
      seq(
        optional(choice(
          $.keyword_no,
          $.keyword_dual,
          $.keyword_local,
          seq($.keyword_not, $.keyword_local),
        )),
        optional(choice($.keyword_before, $.keyword_after)),
        $.keyword_journal,
      ),
    ),

    // ALTER TABLE t, NO FALLBACK, NO BEFORE JOURNAL
    // Teradata attaches its table-attribute list with leading commas, exactly
    // as CREATE TABLE does. The leading comma is what separates this form from
    // the ANSI action list, so the two branches stay LR-decidable. The base
    // rule's ROW LEVEL SECURITY branch is dropped: Teradata has no such action.
    alter_table: $ => seq(
      $.keyword_alter,
      $.keyword_table,
      optional($._if_exists),
      optional($.keyword_only),
      field("target", $.object_reference),
      choice(
        repeat1(seq(',', $.alter_table_option)),
        seq(
          $._alter_specifications,
          repeat(seq(',', $._alter_specifications)),
        ),
      ),
    ),

    // PERM is a prefix of PERMANENT: both stay at the same token precedence so
    // longest-match, not precedence, picks the spelling actually written.
    keyword_perm:      _ => token(prec(1, make_keyword("perm"))),
    keyword_permanent: _ => token(prec(1, make_keyword("permanent"))),
    keyword_spool:     _ => token(prec(1, make_keyword("spool"))),
    keyword_bytes:     _ => token(prec(1, make_keyword("bytes"))),
    keyword_account:   _ => token(prec(1, make_keyword("account"))),

    // base statement dispatch plus Teradata statement forms
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
      )),
      // Request modifiers, like the EXPLAIN prefix above: a clause in front
      // of the request it applies to, rather than a rule that contains it.
      optional(choice(
        $.dump_explain_clause,
        $.insert_explain_clause,
        $.using_request_clause,
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        $._transaction_statement,
        $.collect_statistics_statement,
        $.create_macro_statement,
        $.replace_view,
        $.set_query_band_statement,
        $.help_statement,
        $.compound_statement,
        $.declare_cursor_statement,
        // grammar/admin.js
        $.show_statement,
        $.logging_statement,
        $.database_statement,
        $.give_statement,
        $.rename_object_statement,
        $.delete_database_statement,
        $.checkpoint_statement,
        $.echo_statement,
        $.abort_statement,
        $.collect_demographics_statement,
        $.drop_statistics_statement,
        $.execute_macro_statement,
        // grammar/analysis.js
        $.call_statement,
        $.initiate_index_analysis_statement,
        $.initiate_partition_analysis_statement,
        $.restart_index_analysis_statement,
        $.execute_function_statement,
      ),
    ),

    // Teradata SP cursor: DECLARE cursor_name CURSOR FOR <query> (ISO E121).
    // Minimal override of the base rule; Teradata has no [NO] SCROLL option,
    // and dropping that optional sub-sequence keeps the parse table small.
    declare_cursor_statement: $ => seq(
      $.keyword_declare,
      field('name', $.identifier),
      $.keyword_cursor,
      $.keyword_for,
      $._dml_read,
    ),

    // Atomic UPSERT: UPDATE … SET … [WHERE …] ELSE INSERT … (base update plus
    // the trailing ELSE INSERT tail).
    update: $ => seq(
      $.keyword_update,
      optional($.keyword_only),
      choice(
        $._mysql_update_statement,
        $._postgres_update_statement,
      ),
      optional(seq($.keyword_else, $.insert)),
    ),

    // SEL / DEL abbreviations: the keyword tokens accept both spellings.
    // Declared at default precedence (like all base keywords) so longest
    // match keeps identifiers such as "selection" intact.
    keyword_select: _ => /[Ss][Ee][Ll]([Ee][Cc][Tt])?/,
    keyword_delete: _ => /[Dd][Ee][Ll]([Ee][Tt][Ee])?/,

    // SELECT [TOP n [PERCENT] [WITH TIES]] [DISTINCT] …
    // base select plus TOP n, and Teradata's queue-table consuming read.
    select: $ => seq(
      $.keyword_select,
      optional(seq($.keyword_and, $.keyword_consume)),
      optional(seq(
        $.keyword_top,
        $.literal,
        optional($.keyword_percent),
        optional(seq($.keyword_with, $.keyword_ties)),
      )),
      seq(
        optional($.keyword_distinct),
        $.select_expression,
      ),
    ),

    // base from plus QUALIFY (after HAVING, before window/order)
    from: $ => seq(
      $.keyword_from,
      optional(
        $.keyword_only,
      ),
      comma_list(field('relation', $.relation), true),
      optional($.sample_clause),
      repeat(
        choice(
          $.join,
          $.cross_join,
          $.lateral_join,
          $.lateral_cross_join,
        ),
      ),
      optional($.expand_on_clause),
      optional($.where),
      optional($.group_by),
      optional($.having),
      optional($.qualify),
      optional($.window_clause),
      optional($.order_by),
      // Teradata paging is TOP (in SELECT) / QUALIFY; no LIMIT or FETCH FIRST.
    ),

    // base DDL dispatch plus COMMENT ON (Teradata: COMMENT ON TABLE t IS '…').
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
    ),

    // EXPAND ON period_col [AS alias] [BY interval [anchor]] [FOR period_expr]
    // Teradata's temporal expansion: one row per interval of a PERIOD value.
    expand_on_clause: $ => prec.right(seq(
      $.keyword_expand,
      $.keyword_on,
      field('period', $._expression),
      optional(seq(optional($.keyword_as), field('alias', $.identifier))),
      optional(seq($.keyword_by, field('interval', $._expression))),
      optional(seq($.keyword_for, field('period_expression', $._expression))),
    )),

    // base parameter plus Teradata :name macro/host-variable references
    parameter: _ => /\?|(\$[0-9]+)|(:[a-zA-Z_][a-zA-Z0-9_]*)/,

    // Teradata-specific keywords (dialect-level per AGENTS.md)
    keyword_multiset:   _ => token(prec(1, make_keyword("multiset"))),
    keyword_expand:     _ => token(prec(1, make_keyword("expand"))),

    // ── Keywords for the statements in grammar/analysis.js ─────────────────
    // Statement-initial keywords are reserved for the same reason as above.
    keyword_call:       _ => token(prec(1, make_keyword("call"))),
    // Lexer-precedence guard: `call` above claims the front of `called`.
    keyword_called:     _ => token(prec(1, make_keyword("called"))),
    keyword_dump:       _ => token(prec(1, make_keyword("dump"))),
    keyword_initiate:   _ => token(prec(1, make_keyword("initiate"))),
    keyword_restart:    _ => token(prec(1, make_keyword("restart"))),
    keyword_using:      _ => token(prec(1, make_keyword("using"))),
    // Clause keywords: only reachable mid-statement, so they stay extracted.
    keyword_analysis:   _ => make_keyword("analysis"),
    // KEEP INDEX follows `AS <tag>`, where the tag is an identifier; the
    // extracted keyword loses to the word token in that state.
    keyword_keep:       _ => token(prec(1, make_keyword("keep"))),
    keyword_modified:   _ => make_keyword("modified"),
    keyword_stat:       _ => make_keyword("stat"),
    keyword_sql:        _ => make_keyword("sql"),
    keyword_consume:    _ => make_keyword("consume"),
    keyword_art:        _ => make_keyword("art"),
    keyword_noddltext:  _ => make_keyword("noddltext"),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    // prec-1, not plain make_keyword: compound_statement allows a leading
    // `label:`, so an identifier is legal at statement start and an extracted
    // keyword would lose to it there.
    keyword_show:         _ => token(prec(1, make_keyword("show"))),
    keyword_logging:      _ => token(prec(1, make_keyword("logging"))),
    keyword_capture:      _ => token(prec(1, make_keyword("capture"))),
    keyword_isolated:     _ => token(prec(1, make_keyword("isolated"))),
    keyword_loading:      _ => token(prec(1, make_keyword("loading"))),
    keyword_give:         _ => token(prec(1, make_keyword("give"))),
    keyword_checkpoint:   _ => token(prec(1, make_keyword("checkpoint"))),
    keyword_echo:         _ => token(prec(1, make_keyword("echo"))),
    keyword_abort:        _ => token(prec(1, make_keyword("abort"))),
    keyword_flush:        _ => token(prec(1, make_keyword("flush"))),
    keyword_demographics: _ => token(prec(1, make_keyword("demographics"))),
    keyword_map:          _ => token(prec(1, make_keyword("map"))),
    keyword_method:       _ => token(prec(1, make_keyword("method"))),
    keyword_transform:    _ => token(prec(1, make_keyword("transform"))),
    keyword_online:       _ => token(prec(1, make_keyword("online"))),
    keyword_error:        _ => token(prec(1, make_keyword("error"))),
    keyword_query:        _ => token(prec(1, make_keyword("query"))),
    // Lexer-precedence guard: `query` above claims the front of query_band.
    keyword_query_band:   _ => token(prec(1, /[Qq][Uu][Ee][Rr][Yy]_[Bb][Aa][Nn][Dd]/)),
    keyword_fallback:   _ => token(prec(1, make_keyword("fallback"))),
    keyword_journal:    _ => token(prec(1, make_keyword("journal"))),
    keyword_dual:       _ => token(prec(1, make_keyword("dual"))),
    keyword_macro:      _ => token(prec(1, make_keyword("macro"))),
    keyword_top:        _ => token(prec(1, make_keyword("top"))),
    keyword_global:     _ => token(prec(1, make_keyword("global"))),
    keyword_collect:    _ => token(prec(1, make_keyword("collect"))),
    keyword_summary:    _ => token(prec(1, make_keyword("summary"))),
    keyword_statistics: _ => token(prec(1, make_keyword("statistics"))),
    keyword_stats:      _ => token(prec(1, make_keyword("stats"))),
    keyword_qualify:    _ => token(prec(1, make_keyword("qualify"))),
    keyword_range_n:    _ => token(prec(1, make_keyword("range_n"))),
    keyword_case_n:     _ => token(prec(1, make_keyword("case_n"))),
    keyword_unknown:    _ => token(prec(1, make_keyword("unknown"))),
    keyword_locking:    _ => token(prec(1, make_keyword("locking"))),
    keyword_access:     _ => token(prec(1, make_keyword("access"))),
    keyword_exclusive:  _ => token(prec(1, make_keyword("exclusive"))),
    keyword_protection: _ => token(prec(1, make_keyword("protection"))),
    // keyword_log at prec(1) would shadow base keyword_logged (precedence
    // beats length); guard with an equal-precedence re-declaration.
    keyword_log:        _ => token(prec(1, make_keyword("log"))),
    keyword_logged:     _ => token(prec(1, make_keyword("logged"))),
    keyword_minimum:    _ => token(prec(1, make_keyword("minimum"))),
    keyword_maximum:    _ => token(prec(1, make_keyword("maximum"))),
    keyword_datablocksize:   _ => token(prec(1, make_keyword("datablocksize"))),
    keyword_mergeblockratio: _ => token(prec(1, make_keyword("mergeblockratio"))),
    keyword_freespace:  _ => token(prec(1, make_keyword("freespace"))),
    keyword_blockcompression: _ => token(prec(1, make_keyword("blockcompression"))),
    keyword_checksum:   _ => token(prec(1, make_keyword("checksum"))),
    keyword_sample:     _ => token(prec(1, make_keyword("sample"))),
    keyword_format:     _ => token(prec(1, make_keyword("format"))),
    keyword_help:       _ => token(prec(1, make_keyword("help"))),
    keyword_minus:      _ => token(prec(1, make_keyword("minus"))),
    keyword_preserve:   _ => token(prec(1, make_keyword("preserve"))),
    keyword_none:       _ => token(prec(1, make_keyword("none"))),
    keyword_columns:    _ => token(prec(1, make_keyword("columns"))),
    keyword_compress:   _ => token(prec(1, make_keyword("compress"))),
    keyword_casespecific: _ => token(prec(1, make_keyword("casespecific"))),
    keyword_uppercase:  _ => token(prec(1, make_keyword("uppercase"))),
    keyword_title:      _ => token(prec(1, make_keyword("title"))),
    keyword_share:      _ => token(prec(1, make_keyword("share"))),

    ...teradata_statement_rules,
    ...teradata_admin_rules,
    ...teradata_analysis_rules,

  },
}));
