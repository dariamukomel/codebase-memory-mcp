import postgres from '../postgres/grammar.js';
import { comma_list, optional_parenthesis, wrapped_in_parenthesis, paren_list, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import crdb_statement_rules from './grammar/statements.js';
import crdb_admin_rules from './grammar/admin.js';
import crdb_clause_rules from './grammar/clauses.js';

// CockroachDB SQL; PostgreSQL-compatible by design (wire protocol and
// syntax), layered on the postgres grammar. Adds the CockroachDB-native
// distributed-SQL surface: AS OF SYSTEM TIME, UPSERT, BACKUP/RESTORE,
// IMPORT INTO, CREATE CHANGEFEED, hash-sharded indexes, SHOW statements.
export default canonicalOrder(grammar(postgres, {
  name: 'cockroachdb_sql',

  // conflicts do not propagate from the parent; postgres's list is copied
  // verbatim, followed by CockroachDB-specific entries.
  conflicts: $ => [
    [$.object_reference, $._qualified_field],
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
    // SPLIT AT VALUES (…) shares the base `values` rule with a top-level VALUES.
    [$.values],
    // SET LOCALITY and SET SCHEMA both begin ALTER TABLE … SET.
    [$._alter_specifications],
  ],

  rules: {

    // postgres statement dispatch plus CockroachDB statement forms
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional(choice(
          seq($.keyword_analyze, optional($.keyword_verbose)),
          $.keyword_verbose,
          $.explain_options,
        )),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        $._transaction_statement,
        $.backup_statement,
        $.restore_statement,
        $.import_into_statement,
        $.create_changefeed_statement,
        $.declare_cursor_statement,
        // grammar/admin.js
        $.job_control_statement,
        $.cancel_query_statement,
        $.schedule_control_statement,
        $.set_cluster_setting_statement,
        $.reset_cluster_setting_statement,
        $.create_external_connection_statement,
        $.drop_external_connection_statement,
        $.check_external_connection_statement,
        $.export_statement,
        $.create_statistics_statement,
        $.drop_owned_by_statement,
      ),
    ),

    // postgres _dml_write plus UPSERT
    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
        $._truncate_statement,
        $._copy_statement,
        $.upsert_statement,
      ),
    ),

    // base relation plus optional AS OF SYSTEM TIME on a table reference.
    // Placed inside relation (before the alias) so the token after AS
    // disambiguates: OF → historical read, identifier → alias.
    // No TABLESAMPLE: CockroachDB has no ANSI TABLESAMPLE clause upstream.
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.as_of_clause),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // postgres create_index plus hash-sharded indexes and STORING
    create_index: $ => seq(
      $.keyword_create,
      optional($.keyword_unique),
      $.keyword_index,
      optional($.keyword_concurrently),
      optional(
        seq(
          optional($._if_not_exists),
          field('column', $._column),
        ),
      ),
      $.keyword_on,
      optional($.keyword_only),
      seq(
        $.object_reference,
        optional(
          seq(
            $.keyword_using,
            choice(
              $.keyword_btree,
              $.keyword_hash,
              $.keyword_gist,
              $.keyword_spgist,
              $.keyword_gin,
              $.keyword_brin,
              field('index_type', $.identifier),
            ),
          ),
        ),
        $.index_fields,
      ),
      // CockroachDB: hash-sharded index
      optional(seq(
        $.keyword_using,
        $.keyword_hash,
        optional($.crdb_options_clause),
      )),
      // CockroachDB: STORING (col, ...); non-key covered columns
      optional(seq(
        $.keyword_storing,
        alias($._column_list, $.list),
      )),
      optional($.covering_columns),
      optional($.tablespace),
      optional($.where),
    ),

    // Extend _alter_specifications (re-enumerate the inherited base set) with
    // CockroachDB range administration: SPLIT AT / UNSPLIT AT / SCATTER.
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
      $.split_at,
      $.unsplit_at,
      $.keyword_scatter,
      // Re-enumerating the base set dropped PostgreSQL's storage-parameter
      // actions; CockroachDB keeps them and uses them for row-level TTL
      // (SET (ttl_expire_after = '1 day')).
      seq($.keyword_set, $.storage_parameters),
      seq($.keyword_reset, paren_list($.identifier, true)),
      // Multi-region: SET LOCALITY {GLOBAL | REGIONAL [BY ROW|TABLE]}
      seq(
        $.keyword_set,
        $.keyword_locality,
        choice(
          $.keyword_global,
          seq($.keyword_regional, optional(seq($.keyword_by, choice($.keyword_row, $.keyword_table)))),
        ),
      ),
      // CONFIGURE ZONE {USING var = expr [, …] | DISCARD}
      seq(
        $.keyword_configure,
        $.keyword_zone,
        choice(
          seq($.keyword_using, comma_list(seq($.identifier, '=', $._expression), true)),
          $.keyword_discard,
        ),
      ),
    ),

    split_at: $ => seq(
      $.keyword_split,
      $.keyword_at,
      $.values,
      optional(seq($.keyword_with, $.keyword_expiration, $._expression)),
    ),

    unsplit_at: $ => choice(
      seq($.keyword_unsplit, $.keyword_at, $.values),
      seq($.keyword_unsplit, $.keyword_all),
    ),

    // Column families: FAMILY [name] (col, …) as a table-level element.
    constraint: $ => choice(
      $._constraint_literal,
      $._key_constraint,
      $._primary_key_constraint,
      $._check_constraint,
      $.family_def,
    ),

    family_def: $ => seq(
      $.keyword_family,
      optional($.identifier),
      paren_list($.identifier, true),
    ),

    keyword_family:     _ => token(prec(1, make_keyword("family"))),

    // Multi-region and zone-configuration vocabulary. SURVIVE, PLACEMENT and
    // CONVERT head an ALTER DATABASE alternative and are reserved like the
    // rest of this dialect's keywords; the others only ever follow a keyword,
    // so they stay extracted; REGION is too common a column name to reserve.


    keyword_availability:    _ => make_keyword("availability"),

    keyword_configuration:   _ => make_keyword("configuration"),

    keyword_convert:         _ => token(prec(1, make_keyword("convert"))),

    keyword_failure:         _ => make_keyword("failure"),

    keyword_parent:          _ => make_keyword("parent"),

    keyword_placement:       _ => token(prec(1, make_keyword("placement"))),

    keyword_region:          _ => make_keyword("region"),

    keyword_regions:         _ => make_keyword("regions"),

    keyword_survive:         _ => token(prec(1, make_keyword("survive"))),
    keyword_locality:   _ => token(prec(1, make_keyword("locality"))),
    keyword_regional:   _ => token(prec(1, make_keyword("regional"))),
    keyword_global:     _ => token(prec(1, make_keyword("global"))),
    keyword_configure:  _ => token(prec(1, make_keyword("configure"))),
    keyword_discard:    _ => token(prec(1, make_keyword("discard"))),
    keyword_split:      _ => token(prec(1, make_keyword("split"))),
    keyword_unsplit:    _ => token(prec(1, make_keyword("unsplit"))),
    keyword_scatter:    _ => token(prec(1, make_keyword("scatter"))),
    keyword_at:         _ => token(prec(1, make_keyword("at"))),
    keyword_expiration: _ => token(prec(1, make_keyword("expiration"))),

    // CockroachDB-specific keywords (dialect-level per AGENTS.md; token(prec(1))
    // biases the lexer over plain identifiers)
    keyword_backup:     _ => token(prec(1, make_keyword("backup"))),
    keyword_restore:    _ => token(prec(1, make_keyword("restore"))),
    keyword_import:     _ => token(prec(1, make_keyword("import"))),
    keyword_changefeed: _ => token(prec(1, make_keyword("changefeed"))),
    keyword_upsert:     _ => token(prec(1, make_keyword("upsert"))),
    keyword_latest:     _ => token(prec(1, make_keyword("latest"))),
    keyword_csv:        _ => token(prec(1, make_keyword("csv"))),
    keyword_system:     _ => token(prec(1, make_keyword("system"))),
    keyword_jobs:       _ => token(prec(1, make_keyword("jobs"))),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    // `job` and `setting` sit at the same precedence as the already-declared
    // `jobs` and `settings`, so match length (not precedence) decides.
    keyword_job:        _ => token(prec(1, make_keyword("job"))),
    keyword_setting:    _ => token(prec(1, make_keyword("setting"))),
    keyword_cancel:     _ => token(prec(1, make_keyword("cancel"))),
    keyword_pause:      _ => token(prec(1, make_keyword("pause"))),
    keyword_resume:     _ => token(prec(1, make_keyword("resume"))),
    keyword_query:      _ => token(prec(1, make_keyword("query"))),
    keyword_queries:    _ => token(prec(1, make_keyword("queries"))),
    keyword_sessions:   _ => token(prec(1, make_keyword("sessions"))),
    keyword_schedule:   _ => token(prec(1, make_keyword("schedule"))),
    keyword_schedules:  _ => token(prec(1, make_keyword("schedules"))),
    keyword_export:     _ => token(prec(1, make_keyword("export"))),
    keyword_users:      _ => token(prec(1, make_keyword("users"))),
    keyword_databases:  _ => token(prec(1, make_keyword("databases"))),
    keyword_grants:     _ => token(prec(1, make_keyword("grants"))),
    keyword_columns:    _ => token(prec(1, make_keyword("columns"))),
    keyword_storing:    _ => token(prec(1, make_keyword("storing"))),

    ...crdb_statement_rules,
    ...crdb_admin_rules,
    // last, so its overrides win over the inherited rules
    ...crdb_clause_rules,

  },
}));
