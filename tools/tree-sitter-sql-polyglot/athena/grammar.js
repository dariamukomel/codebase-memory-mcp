import trino from '../trino/grammar.js';
import { createStatementChoices } from '../trino/grammar/legacy_statements.js';
import { optional_parenthesis, paren_list, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import athena_statement_rules from './grammar/statements.js';
import athena_create_rules from './grammar/create.js';
import athena_admin_rules from './grammar/admin.js';

export default canonicalOrder(grammar(trino, {
  name: 'athena_sql',

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
    [$.field, $._qualified_field],
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
    [$.values],
    // The fifteen other entries this list used to carry (the lambda group,
    // row_type/invocation, array_type/array, match_recognize_clause,
    // set_statement/set_session_statement, from, term, select_expression,
    // set_operation, group_by, order_target, _column/_qualified_field) were
    // copied from trino and are all reported unnecessary here.
  ],

  rules: {

    // Athena is managed Trino: catalogs are registered through Glue and Lambda
    // connectors, never with SQL. Take Trino's dynamic-catalog statements back
    // out of the inherited dispatch lists rather than inheriting syntax the
    // engine rejects.
    _create_statement: $ => seq(choice(
      ...createStatementChoices($, { materializedView: true }),
    )),

    _drop_statement: $ => seq(choice(
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
    )),

    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
        optional($.explain_options),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        // No SAVEPOINT: Athena (managed Trino) has no savepoints.
        $.prepare_statement,
        $.execute_statement,
        $.deallocate_statement,
        $.show_stats_statement,
        $.set_session_statement,
        $.reset_session_statement,
        $.unload_statement,
        $.msck_repair_statement,
        $.create_external_table,
        $.show_statement,
        $.describe_statement,
        // grammar/admin.js
        $.athena_show_statement,
        $.alter_database_properties,
        $.alter_view_dialect,
        $.describe_view_statement,
        $.analyze_statement,
        $.comment_on_statement,
        $.show_partitions_statement,
        $.show_create_statement,
        $.vacuum_statement,
        $.optimize_statement,
      ),
    ),

    // VACUUM <table> (Iceberg snapshot expiry / orphan-file cleanup)
    vacuum_statement: $ => seq($.keyword_vacuum, $.object_reference),

    // OPTIMIZE <table> REWRITE DATA USING BIN_PACK [WHERE predicate]
    // (Iceberg compaction)
    optimize_statement: $ => seq(
      $.keyword_optimize,
      $.object_reference,
      $.keyword_rewrite,
      $.keyword_data,
      $.keyword_using,
      $.keyword_bin_pack,
      optional($.where),
    ),

    keyword_optimize: _ => token(prec(1, make_keyword("optimize"))),
    keyword_rewrite:  _ => token(prec(1, make_keyword("rewrite"))),
    keyword_bin_pack: _ => token(prec(1, make_keyword("bin_pack"))),

    // Hive-style partition management on ALTER TABLE (re-enumerates the base set).
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
      seq(
        $.keyword_add,
        optional($._if_not_exists),
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
        optional(seq($.keyword_location, alias($._literal_string, $.literal))),
      ),
      seq(
        $.keyword_drop,
        optional($._if_exists),
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
      ),
      seq($.keyword_set, $.keyword_location, alias($._literal_string, $.literal)),
      // ALTER TABLE t SET TBLPROPERTIES ('k' = 'v' [, …])
      seq(
        $.keyword_set,
        $.keyword_tblproperties,
        paren_list($.property_pair, true),
      ),
      // ALTER TABLE t {ADD | REPLACE} COLUMNS (col type [, …])
      seq(
        choice($.keyword_add, $.keyword_replace),
        $.keyword_columns,
        $.column_definitions,
      ),
      // ALTER TABLE t RENAME PARTITION (…) TO PARTITION (…)
      seq(
        $.keyword_rename,
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
        $.keyword_to,
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
      ),
    ),

    keyword_vacuum:       _ => token(prec(1, make_keyword("vacuum"))),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    keyword_views:        _ => token(prec(1, make_keyword("views"))),
    keyword_databases:    _ => token(prec(1, make_keyword("databases"))),
    keyword_dbproperties: _ => token(prec(1, make_keyword("dbproperties"))),
    keyword_dialect:      _ => token(prec(1, make_keyword("dialect"))),

    // Athena-specific keywords (not in Trino or base; defined here only)
    keyword_unload:       _ => token(prec(1, make_keyword("unload"))),
    keyword_msck:         _ => token(prec(1, make_keyword("msck"))),
    keyword_repair:       _ => token(prec(1, make_keyword("repair"))),
    keyword_sync:         _ => token(prec(1, make_keyword("sync"))),
    keyword_partitions:   _ => token(prec(1, make_keyword("partitions"))),
    keyword_partitioned:  _ => token(prec(1, make_keyword("partitioned"))),
    keyword_location:     _ => token(prec(1, make_keyword("location"))),
    keyword_serde:        _ => token(prec(1, make_keyword("serde"))),
    keyword_serdeproperties: _ => token(prec(1, make_keyword("serdeproperties"))),
    keyword_stored:       _ => token(prec(1, make_keyword("stored"))),
    keyword_tblproperties: _ => token(prec(1, make_keyword("tblproperties"))),
    keyword_textfile:     _ => token(prec(1, make_keyword("textfile"))),
    keyword_parquet:      _ => token(prec(1, make_keyword("parquet"))),
    keyword_orc:          _ => token(prec(1, make_keyword("orc"))),
    keyword_avro:         _ => token(prec(1, make_keyword("avro"))),
    keyword_rcfile:       _ => token(prec(1, make_keyword("rcfile"))),
    keyword_sequencefile: _ => token(prec(1, make_keyword("sequencefile"))),
    keyword_inputformat:  _ => token(prec(1, make_keyword("inputformat"))),
    keyword_delimited:    _ => token(prec(1, make_keyword("delimited"))),
    keyword_terminated:   _ => token(prec(1, make_keyword("terminated"))),
    keyword_fields:       _ => token(prec(1, make_keyword("fields"))),
    keyword_lines:        _ => token(prec(1, make_keyword("lines"))),

    ...athena_statement_rules,
    ...athena_admin_rules,
    ...athena_create_rules,

  },
}));
