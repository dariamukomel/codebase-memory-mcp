import base from '../grammar.js';
import { comma_list, paren_list, optional_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import { fromClause } from '../grammar/statements/select.js';

import create_rules from './grammar/create.js';
import alter_rules  from './grammar/alter.js';
import drop_rules   from './grammar/drop.js';
import show_rules   from './grammar/show.js';
import dml_rules    from './grammar/dml.js';
import utility_rules from './grammar/utility.js';
import type_rules   from './grammar/types.js';
import select_rules from './grammar/select.js';
import ml_rules     from './grammar/ml.js';
import match_recognize_rules from './grammar/match_recognize.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'flink_sql',

  conflicts: $ => [
    // Inherited base conflicts
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
    // Flink-specific conflicts
    [$.metadata_column, $.column_definition],
    [$._column, $.metadata_column],
    [$.computed_column, $.column_definition],
    [$.row_type],
    [$.object_reference, $.function_argument],
    [$.use_catalog_statement, $.use_database_statement],
    [$.execute_statement, $.execute_plan],
    [$.alter_table, $.alter_materialized_table],
    [$.create_table, $.create_materialized_table],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // LIMIT is supported: fromClause with limit re-adds it over the ANSI base.
    from: $ => fromClause($, { limit: true }),

    // ── DDL dispatcher ────────────────────────────────────────────────────────
    // No GRANT/REVOKE: Flink SQL has no standard access-control DDL.
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      // Flink USE / MODULE / JAR
      $.use_catalog_statement,
      $.use_database_statement,
      $.use_modules_statement,
      $.load_module,
      $.unload_module,
      $.add_jar,
      $.remove_jar,
      // Flink utility
      $.analyze_table,
      $.stop_job,
      $.compile_plan,
      $.execute_plan,
      // SHOW / DESCRIBE
      $.show_statement,
      $.describe_statement,
      // Config (replaces base set_statement in Flink context)
      $.set_statement,
      $.reset_statement,
      $.comment_statement,
    ),

    // ── CREATE dispatcher ─────────────────────────────────────────────────────
    _create_statement: $ => seq(
      choice(
        // Base (re-enumerated)
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
        prec.left(seq($.create_schema, repeat($._create_statement))),
        // Flink additions
        $.create_catalog,
        $.create_model,
        $.create_materialized_table,
        $.create_connection,
      ),
    ),

    // ── ALTER dispatcher ──────────────────────────────────────────────────────
    _alter_statement: $ => seq(
      choice(
        // Flink overrides for base
        $.alter_table,
        $.alter_view,
        // Base (kept)
        $.alter_materialized_view,
        $.alter_schema,
        $.alter_type,
        $.alter_index,
        $.alter_sequence,
        $.alter_role,
        // Base alter_database overridden by Flink
        $.alter_database,
        // Flink additions
        $.alter_catalog,
        $.alter_function,
        $.alter_model,
        $.alter_materialized_table,
        $.alter_connection,
      ),
    ),

    // ── DROP dispatcher ───────────────────────────────────────────────────────
    _drop_statement: $ => seq(
      choice(
        // Base (re-enumerated)
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
        // Flink additions
        $.drop_catalog,
        $.drop_materialized_table,
        $.drop_model,
        $.drop_connection,
      ),
    ),

    // ── DML write dispatcher ──────────────────────────────────────────────────
    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
        $._truncate_statement,
        // Flink additions
        $.execute_statement_set,
        $.begin_statement_set,
        $.compile_and_execute_plan,
      ),
    ),

    // ── Statement: add Flink-specific statement forms ─────────────────────────
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
        // Flink EXECUTE select / plan / statement_set
        $.execute_statement,
        $.call_statement,
      ),
    ),

    // ── _expression: add Flink ML TVFs ───────────────────────────────────────
    _expression: $ => prec(1, choice(
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
      // Flink ML TVFs (appear as expressions in SELECT list)
      $.ml_predict_tvf,
      $.ml_evaluate_tvf,
      $.vector_search_tvf,
    )),

    // ── New keywords (not in base) ────────────────────────────────────────────
    keyword_virtual:      _ => token(prec(1, make_keyword("virtual"))),
    keyword_metadata:     _ => token(prec(1, make_keyword("metadata"))),
    keyword_watermark:    _ => token(prec(1, make_keyword("watermark"))),
    keyword_watermarks:   _ => token(prec(1, make_keyword("watermarks"))),
    keyword_descriptor:   _ => token(prec(1, make_keyword("descriptor"))),
    keyword_distributed:  _ => token(prec(1, make_keyword("distributed"))),
    keyword_buckets:      _ => token(prec(1, make_keyword("buckets"))),
    keyword_distribution: _ => token(prec(1, make_keyword("distribution"))),
    keyword_partitioned:  _ => token(prec(1, make_keyword("partitioned"))),
    keyword_partitions:   _ => token(prec(1, make_keyword("partitions"))),
    keyword_ilike:        _ => token(prec(1, make_keyword("ilike"))),
    keyword_load:         _ => token(prec(1, make_keyword("load"))),
    keyword_unload:       _ => token(prec(1, make_keyword("unload"))),
    keyword_module:       _ => token(prec(1, make_keyword("module"))),
    keyword_modules:      _ => token(prec(1, make_keyword("modules"))),
    keyword_jar:          _ => token(prec(1, make_keyword("jar"))),
    keyword_jars:         _ => token(prec(1, make_keyword("jars"))),
    keyword_remove:       _ => token(prec(1, make_keyword("remove"))),
    keyword_upsert:       _ => token(prec(1, make_keyword("upsert"))),
    keyword_overwrite:    _ => token(prec(1, make_keyword("overwrite"))),
    keyword_plan:         _ => token(prec(1, make_keyword("plan"))),
    keyword_compile:      _ => token(prec(1, make_keyword("compile"))),
    keyword_compute:      _ => token(prec(1, make_keyword("compute"))),
    keyword_statistics:   _ => token(prec(1, make_keyword("statistics"))),
    keyword_stop:         _ => token(prec(1, make_keyword("stop"))),
    keyword_savepoint:    _ => token(prec(1, make_keyword("savepoint"))),
    keyword_drain:        _ => token(prec(1, make_keyword("drain"))),
    keyword_bytes:        _ => token(prec(1, make_keyword("bytes"))),
    keyword_timestamp_ltz:_ => token(prec(1, make_keyword("timestamp_ltz"))),
    keyword_multiset:     _ => token(prec(1, make_keyword("multiset"))),
    keyword_map:          _ => token(prec(1, make_keyword("map"))),
    keyword_raw:          _ => token(prec(1, make_keyword("raw"))),
    keyword_tumble:       _ => token(prec(1, make_keyword("tumble"))),
    keyword_hop:          _ => token(prec(1, make_keyword("hop"))),
    keyword_cumulate:     _ => token(prec(1, make_keyword("cumulate"))),
    keyword_freshness:    _ => token(prec(1, make_keyword("freshness"))),
    keyword_continuous:   _ => token(prec(1, make_keyword("continuous"))),
    keyword_suspend:      _ => token(prec(1, make_keyword("suspend"))),
    keyword_resume:       _ => token(prec(1, make_keyword("resume"))),
    keyword_model:        _ => token(prec(1, make_keyword("model"))),
    keyword_models:       _ => token(prec(1, make_keyword("models"))),
    keyword_overwriting:  _ => token(prec(1, make_keyword("overwriting"))),
    keyword_including:    _ => token(prec(1, make_keyword("including"))),
    keyword_excluding:    _ => token(prec(1, make_keyword("excluding"))),
    keyword_artifact:     _ => token(prec(1, make_keyword("artifact"))),
    keyword_java:         _ => token(prec(1, make_keyword("java"))),
    keyword_scala:        _ => token(prec(1, make_keyword("scala"))),
    keyword_python:       _ => token(prec(1, make_keyword("python"))),
    keyword_system:       _ => token(prec(1, make_keyword("system"))),
    keyword_job:          _ => token(prec(1, make_keyword("job"))),
    keyword_jobs:         _ => token(prec(1, make_keyword("jobs"))),
    keyword_show:         _ => token(prec(1, make_keyword("show"))),
    keyword_catalogs:     _ => token(prec(1, make_keyword("catalogs"))),
    keyword_databases:    _ => token(prec(1, make_keyword("databases"))),
    keyword_views:        _ => token(prec(1, make_keyword("views"))),
    keyword_columns:      _ => token(prec(1, make_keyword("columns"))),
    keyword_functions:    _ => token(prec(1, make_keyword("functions"))),
    keyword_procedures:   _ => token(prec(1, make_keyword("procedures"))),
    keyword_connections:  _ => token(prec(1, make_keyword("connections"))),
    keyword_output:       _ => token(prec(1, make_keyword("output"))),
    keyword_enforced:     _ => token(prec(1, make_keyword("enforced"))),
    keyword_call:         _ => token(prec(1, make_keyword("call"))),
    keyword_sql:          _ => token(prec(1, make_keyword("sql"))),
    keyword_options:      _ => token(prec(1, make_keyword("options"))),
    keyword_desc:         _ => token(prec(1, make_keyword("desc"))),
    keyword_describe:     _ => token(prec(1, make_keyword("describe"))),
    keyword_extended:     _ => token(prec(1, make_keyword("extended"))),
    keyword_tinyint:      _ => token(prec(1, make_keyword("tinyint"))),
    keyword_refresh_mode: _ => token(prec(1, /[Rr][Ee][Ff][Rr][Ee][Ss][Hh]_[Mm][Oo][Dd][Ee]/)),
    keyword_system_time:  _ => token(prec(1, /[Ss][Yy][Ss][Tt][Ee][Mm]_[Tt][Ii][Mm][Ee]/)),
    keyword_match_recognize: _ => token(prec(1, /[Mm][Aa][Tt][Cc][Hh]_[Rr][Ee][Cc][Oo][Gg][Nn][Ii][Zz][Ee]/)),
    keyword_measures:     _ => token(prec(1, make_keyword("measures"))),
    keyword_pattern:      _ => token(prec(1, make_keyword("pattern"))),
    keyword_define:       _ => token(prec(1, make_keyword("define"))),
    keyword_per:          _ => token(prec(1, make_keyword("per"))),
    keyword_skip:         _ => token(prec(1, make_keyword("skip"))),
    keyword_past:         _ => token(prec(1, make_keyword("past"))),
    keyword_one:          _ => token(prec(1, make_keyword("one"))),
    keyword_match:        _ => token(prec(1, make_keyword("match"))),
    // keyword_match / keyword_per are strict prefixes of keyword_matched /
    // keyword_percent; explicit precedence beats match length in the lexer, so
    // re-declare the longer keywords at equal precedence (keeps MERGE's WHEN
    // MATCHED and TABLESAMPLE … PERCENT lexable).
    keyword_matched:      _ => token(prec(1, make_keyword("matched"))),
    keyword_percent:      _ => token(prec(1, make_keyword("percent"))),
    keyword_ml_predict:   _ => token(prec(1, /[Mm][Ll]_[Pp][Rr][Ee][Dd][Ii][Cc][Tt]/)),
    keyword_ml_evaluate:  _ => token(prec(1, /[Mm][Ll]_[Ee][Vv][Aa][Ll][Uu][Aa][Tt][Ee]/)),
    keyword_vector_search:_ => token(prec(1, /[Vv][Ee][Cc][Tt][Oo][Rr]_[Ss][Ee][Aa][Rr][Cc][Hh]/)),

    // Spread all sub-module rules
    ...create_rules,
    ...alter_rules,
    ...drop_rules,
    ...show_rules,
    ...dml_rules,
    ...utility_rules,
    ...type_rules,
    ...select_rules,
    ...ml_rules,
    ...match_recognize_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_called: _ => token(prec(1, make_keyword("called"))),

  },
}));
