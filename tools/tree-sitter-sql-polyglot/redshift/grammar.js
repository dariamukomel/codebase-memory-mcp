import base from '../grammar.js';
import { optional_parenthesis, make_keyword, comma_list, paren_list, canonicalOrder } from '../grammar/helpers.js';
import { fromClause } from '../grammar/statements/select.js';
import rs_create_rules from './grammar/create.js';
import rs_copy_rules   from './grammar/copy.js';
import rs_optimize_rules from './grammar/optimize.js';
import redshift_clause_rules from './grammar/clauses.js';
import objects_rules  from './grammar/objects.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'redshift_sql',

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
    [$.alter_group_statement, $.alter_role],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // LIMIT is supported: fromClause with limit re-adds it over the ANSI base.
    from: $ => fromClause($, { limit: true }),

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
        $.copy_statement,
        $.unload_statement,
        $.alter_group_statement,
        $.set_session_variable_statement,
        $.prepare_statement,
        $.execute_statement,
        $.deallocate_statement,
        $.declare_cursor_statement,
        $.show_statement,
        $.desc_statement,
        $.cancel_statement,
        $.abort_statement,
        $.end_statement,
        $.lock_statement,
        $.call_statement,
        $.close_statement,
        $.fetch_statement,
        $.analyze_statement,
        $.set_session_authorization,
      ),
    ),

    // ── Keywords for the statements in grammar/objects.js ──────────────────
    // Plural/singular pairs (schemas/schema, policies/policy, templates/…)
    // sit at the same precedence as their singular counterparts, so match
    // length (not precedence) picks between them.
    keyword_show:        _ => token(prec(1, make_keyword("show"))),
    // ALTER DATABASE / ALTER MATERIALIZED VIEW vocabulary; each follows a
    // keyword rather than a name, so they stay extracted.
    keyword_conjunction:    _ => make_keyword("conjunction"),
    keyword_inerror:        _ => make_keyword("inerror"),
    keyword_integration:    _ => make_keyword("integration"),
    keyword_unlimited:      _ => make_keyword("unlimited"),
    keyword_schemas:     _ => token(prec(1, make_keyword("schemas"))),
    keyword_databases:   _ => token(prec(1, make_keyword("databases"))),
    keyword_datashares:  _ => token(prec(1, make_keyword("datashares"))),
    keyword_columns:     _ => token(prec(1, make_keyword("columns"))),
    keyword_grants:      _ => token(prec(1, make_keyword("grants"))),
    keyword_keys:        _ => token(prec(1, make_keyword("keys"))),
    keyword_constraints: _ => token(prec(1, make_keyword("constraints"))),
    keyword_exported:    _ => token(prec(1, make_keyword("exported"))),
    keyword_parameters:  _ => token(prec(1, make_keyword("parameters"))),
    keyword_predicate:   _ => token(prec(1, make_keyword("predicate"))),
    keyword_namespace:   _ => token(prec(1, make_keyword("namespace"))),
    keyword_account:     _ => token(prec(1, make_keyword("account"))),
    keyword_priority:    _ => token(prec(1, make_keyword("priority"))),
    keyword_masking:     _ => token(prec(1, make_keyword("masking"))),
    keyword_rls:         _ => token(prec(1, make_keyword("rls"))),
    keyword_policy:      _ => token(prec(1, make_keyword("policy"))),
    keyword_policies:    _ => token(prec(1, make_keyword("policies"))),
    keyword_identity:    _ => token(prec(1, make_keyword("identity"))),
    keyword_provider:    _ => token(prec(1, make_keyword("provider"))),
    keyword_library:     _ => token(prec(1, make_keyword("library"))),
    keyword_template:    _ => token(prec(1, make_keyword("template"))),
    keyword_templates:   _ => token(prec(1, make_keyword("templates"))),
    keyword_definition:  _ => token(prec(1, make_keyword("definition"))),
    keyword_attach:      _ => token(prec(1, make_keyword("attach"))),
    keyword_detach:      _ => token(prec(1, make_keyword("detach"))),
    keyword_cancel:      _ => token(prec(1, make_keyword("cancel"))),
    keyword_abort:       _ => token(prec(1, make_keyword("abort"))),
    keyword_close:       _ => token(prec(1, make_keyword("close"))),
    keyword_forward:     _ => token(prec(1, make_keyword("forward"))),
    keyword_lock:        _ => token(prec(1, make_keyword("lock"))),
    keyword_call:        _ => token(prec(1, make_keyword("call"))),
    // Lexer-precedence guard: `call` above is a strict prefix of the base
    // grammar's prec-0 `called`, and explicit precedence beats match length,
    // so `called` has to be re-declared at the same precedence to stay
    // lexable in this dialect.
    keyword_called:      _ => token(prec(1, make_keyword("called"))),

    // Redshift: DECLARE cursor_name CURSOR FOR query (ISO E121).
    declare_cursor_statement: $ => seq(
      $.keyword_declare,
      field('name', $.identifier),
      $.keyword_cursor,
      $.keyword_for,
      $._dml_read,
    ),

    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.reset_statement,
      $.grant_statement,
      $.revoke_statement,
      $.alter_datashare,
      $._optimize_statement,
      $.comment_statement,
      // grammar/objects.js
      $.create_masking_policy,
      $.alter_masking_policy,
      $.drop_masking_policy,
      $.attach_masking_policy,
      $.detach_masking_policy,
      $.create_rls_policy,
      $.alter_rls_policy,
      $.drop_rls_policy,
      $.attach_rls_policy,
      $.detach_rls_policy,
      $.create_identity_provider,
      $.drop_identity_provider,
      $.create_library,
      $.drop_library,
      $.create_template,
      $.alter_template,
      $.drop_template,
      $.alter_system_statement,
      $.alter_default_privileges,
      $.create_external_view,
      $.alter_external_view,
      $.drop_external_view,
      $.drop_model,
    ),

    // PREPARE name [(data_type, ...)] AS statement (PostgreSQL-style)
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

    // EXECUTE name [(parameter, ...)]
    execute_statement: $ => seq(
      $.keyword_execute,
      field('name', $.identifier),
      optional(paren_list($._expression, true)),
    ),

    // DEALLOCATE [PREPARE] { name | ALL }
    deallocate_statement: $ => seq(
      $.keyword_deallocate,
      optional($.keyword_prepare),
      choice(
        field('name', $.identifier),
        $.keyword_all,
      ),
    ),

    // Override _expression to add approximate_count
    _expression: $ => prec(1,
      choice(
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
        $.trim_expression,
        $.approximate_count,
      ),
    ),

    // APPROXIMATE COUNT(DISTINCT col)
    approximate_count: $ => seq(
      $.keyword_approximate,
      $.invocation,
    ),

    // ── Redshift-specific keywords ───────────────────────────────────────────
    // COPY / UNLOAD
    keyword_prepare:      _ => token(prec(1, make_keyword("prepare"))),
    keyword_deallocate:   _ => token(prec(1, make_keyword("deallocate"))),
    keyword_copy:         _ => token(prec(1, make_keyword("copy"))),
    keyword_unload:       _ => token(prec(1, make_keyword("unload"))),
    keyword_iam_role:     _ => token(prec(1, make_keyword("iam_role"))),
    // Federated CREATE EXTERNAL SCHEMA sources and their connection options.
    keyword_postgres:     _ => token(prec(1, make_keyword("postgres"))),
    keyword_mysql:        _ => token(prec(1, make_keyword("mysql"))),
    keyword_kinesis:      _ => token(prec(1, make_keyword("kinesis"))),
    keyword_msk:          _ => token(prec(1, make_keyword("msk"))),
    keyword_redshift:     _ => token(prec(1, make_keyword("redshift"))),
    keyword_uri:          _ => token(prec(1, make_keyword("uri"))),
    keyword_port:         _ => token(prec(1, make_keyword("port"))),
    keyword_secret_arn:   _ => token(prec(1, make_keyword("secret_arn"))),
    keyword_properties:   _ => token(prec(1, make_keyword("properties"))),
    keyword_lambda:       _ => token(prec(1, make_keyword("lambda"))),
    keyword_datashare:    _ => token(prec(1, make_keyword("datashare"))),
    keyword_remove:       _ => token(prec(1, make_keyword("remove"))),
    keyword_model:        _ => token(prec(1, make_keyword("model"))),
    keyword_target:       _ => token(prec(1, make_keyword("target"))),
    keyword_settings:     _ => token(prec(1, make_keyword("settings"))),
    keyword_off:          _ => token(prec(1, make_keyword("off"))),
    // keyword_off is a strict prefix of keyword_offset; explicit precedence
    // beats match length in the lexer, so re-declare keyword_offset at equal
    // precedence to keep OFFSET / FETCH and LIMIT … OFFSET lexable.
    keyword_offset:       _ => token(prec(1, make_keyword("offset"))),
    keyword_ignoreheader: _ => token(prec(1, make_keyword("ignoreheader"))),
    keyword_maxfilesize:  _ => token(prec(1, make_keyword("maxfilesize"))),
    keyword_gzip:         _ => token(prec(1, make_keyword("gzip"))),
    keyword_bzip2:        _ => token(prec(1, make_keyword("bzip2"))),
    keyword_lzop:         _ => token(prec(1, make_keyword("lzop"))),
    keyword_zstd:         _ => token(prec(1, make_keyword("zstd"))),
    keyword_format:       _ => token(prec(1, make_keyword("format"))),
    keyword_csv:          _ => token(prec(1, make_keyword("csv"))),
    keyword_delimiter:    _ => token(prec(1, make_keyword("delimiter"))),
    keyword_quote:        _ => token(prec(1, make_keyword("quote"))),
    keyword_parquet:      _ => token(prec(1, make_keyword("parquet"))),
    keyword_orc:          _ => token(prec(1, make_keyword("orc"))),
    keyword_avro:         _ => token(prec(1, make_keyword("avro"))),
    keyword_rcfile:       _ => token(prec(1, make_keyword("rcfile"))),
    keyword_compression:  _ => token(prec(1, make_keyword("compression"))),

    // VACUUM / ANALYZE COMPRESSION
    keyword_vacuum:       _ => token(prec(1, make_keyword("vacuum"))),
    keyword_reindex:      _ => token(prec(1, make_keyword("reindex"))),
    // keyword_sort prefix-check: keyword_sortkey also prec(1); longest match wins
    keyword_sort:         _ => token(prec(1, make_keyword("sort"))),

    // Distribution / Sort keys
    // keyword_distkey prefix-check: keyword_diststyle shares 'dist' prefix,
    // both prec(1), different suffix 'k' vs 's'; no shadowing.
    keyword_distkey:      _ => token(prec(1, make_keyword("distkey"))),
    keyword_sortkey:      _ => token(prec(1, make_keyword("sortkey"))),
    keyword_diststyle:    _ => token(prec(1, make_keyword("diststyle"))),
    keyword_encode:       _ => token(prec(1, make_keyword("encode"))),
    keyword_compound:     _ => token(prec(1, make_keyword("compound"))),
    keyword_interleaved:  _ => token(prec(1, make_keyword("interleaved"))),
    keyword_even:         _ => token(prec(1, make_keyword("even"))),
    keyword_auto:         _ => token(prec(1, make_keyword("auto"))),
    keyword_yes:          _ => token(prec(1, make_keyword("yes"))),
    keyword_backup:       _ => token(prec(1, make_keyword("backup"))),

    // EXTERNAL SCHEMA / TABLE
    keyword_stored:       _ => token(prec(1, make_keyword("stored"))),
    keyword_location:     _ => token(prec(1, make_keyword("location"))),

    // PARTITIONED BY / ROW FORMAT DELIMITED
    keyword_partitioned:  _ => token(prec(1, make_keyword("partitioned"))),
    keyword_delimited:    _ => token(prec(1, make_keyword("delimited"))),
    keyword_fields:       _ => token(prec(1, make_keyword("fields"))),
    keyword_terminated:   _ => token(prec(1, make_keyword("terminated"))),

    // APPROXIMATE COUNT
    keyword_approximate:  _ => token(prec(1, make_keyword("approximate"))),

    // User / Group management
    keyword_nocreatedb:   _ => token(prec(1, make_keyword("nocreatedb"))),
    keyword_nocreateuser: _ => token(prec(1, make_keyword("nocreateuser"))),
    keyword_syslog:       _ => token(prec(1, make_keyword("syslog"))),
    keyword_access:       _ => token(prec(1, make_keyword("access"))),
    keyword_unrestricted: _ => token(prec(1, make_keyword("unrestricted"))),
    keyword_timeout:      _ => token(prec(1, make_keyword("timeout"))),

    // Bulk GRANT keywords (#87)
    keyword_sequences:    _ => token(prec(1, make_keyword("sequences"))),
    keyword_functions:    _ => token(prec(1, make_keyword("functions"))),
    keyword_procedures:   _ => token(prec(1, make_keyword("procedures"))),
    keyword_append:       _ => token(prec(1, make_keyword("append"))),
    keyword_declare:      _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:       _ => token(prec(1, make_keyword("cursor"))),

    // GRANT ... ON ALL TABLES/FUNCTIONS/PROCEDURES IN SCHEMA name (#87)
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
        ),
        $.keyword_in,
        $.keyword_schema,
        comma_list($.object_reference, true),
      ),
      $.object_reference,
    ),

    ...rs_create_rules,
    ...rs_copy_rules,
    ...rs_optimize_rules,
    ...objects_rules,
    // last, so its overrides win over the inherited rules
    ...redshift_clause_rules,

  },
}));
