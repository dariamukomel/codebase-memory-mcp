import hive from '../hive/grammar.js';
import { paren_list, optional_parenthesis, comma_list, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import spark_create_rules from './grammar/create.js';
import spark_optimize_rules from './grammar/optimize.js';
import spark_spark4_rules from './grammar/spark4_features.js';
import spark_scripting_rules from './grammar/scripting.js';
import spark_iceberg_rules from './grammar/iceberg.js';
import spark_select_rules from './grammar/select.js';
import spark_cache_rules from './grammar/cache.js';
import spark_resource_rules from './grammar/resource.js';
import spark_clause_rules from './grammar/clauses.js';

export default canonicalOrder(grammar(hive, {
  name: 'spark_sql',

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
    [$.from],
    [$.create_function],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
    [$.term],
    [$.lateral_cross_join],
    [$.values],
    [$.select_expression],
    [$.set_operation],
    [$.group_by],
    [$.subquery, $.lateral_subquery],
    [$.order_target],
    [$.write_order],
    [$.cluster_by],
    [$.distribute_by],
    [$.sort_by],
    [$.qualify],
    // Inherited from Hive: multi-table INSERT ambiguity
    [$.select, $.multi_table_insert],
    // Inherited from Hive: SERDE optional WITH SERDEPROPERTIES ambiguity
    [$.row_format],
    [$.lateral_view],
  ],

  rules: {
    // _create_statement is inherited from Hive unchanged: it opts into
    // CREATE MATERIALIZED VIEW, which Spark 4.x also documents (Declarative
    // Pipelines), so there is nothing to narrow here.

    // Re-add $.block to program (removed from base; procedural blocks are Spark-specific)
    program: $ => seq(
      repeat(
        seq(
          choice(
            $.transaction,
            $.statement,
          ),
          ';',
        ),
      ),
      optional(
        $.statement,
      ),
    ),

    // Override base statement to include Spark scripting constructs
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
        $.block,
        $.while_statement,
        $.if_statement,
        $.for_statement,
        $.loop_statement,
        $.repeat_statement,
        $.leave_statement,
        $.iterate_statement,
        $.signal_statement,
        $.resignal_statement,
        $.get_diagnostics_statement,
      ),
    ),

    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional(
          choice(
            $._temporary,
            $.keyword_unlogged,
            $.keyword_external,
          )
        ),
        $.keyword_table,
        optional($._if_not_exists),
        field("target", $.object_reference),
        seq(
          optional($.column_definitions),
          repeat($._table_settings),
          optional(seq($.keyword_as, $.create_query)),
        ),
      ),
    ),

    alter_view: $ => seq(
      $.keyword_alter,
      $.keyword_view,
      optional($._if_exists),
      field('target', $.object_reference),
      choice(
        $.rename_object,
        $.rename_column,
        $.set_schema,
        $.change_ownership,
        seq($.keyword_as, $._dml_read),
        seq($.keyword_set, $.keyword_tblproperties, paren_list($.table_option, true)),
        seq($.keyword_unset, $.keyword_tblproperties, paren_list($._expression, true)),
      ),
    ),

    _optimize_statement: $ => choice(
      $._optimize_table,
      $._compute_stats,
      $._spark_analyze,
      $._delta_optimize,
    ),

    // Override _ddl_statement to add Spark 4.0 variable statements and CALL
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._optimize_statement,
      $._merge_statement,
      $._refresh_statement,
      $.comment_statement,
      $.set_statement,
      $.reset_statement,
      $.use_statement,
      // inherited Hive metadata/data statements (must be re-enumerated:
      // an override replaces the parent rule wholesale)
      $.show_statement,
      $.describe_statement,
      // OSS Spark cache + resource management (previously only in databricks)
      $.cache_table,
      $.uncache_table,
      $.clear_cache,
      $.add_resource_statement,
      $.list_resource_statement,
      $.describe_query,
      $.set_path_statement,
      $.create_table_like,
      $.show_collations_statement,
      $.msck_repair_statement,
      $.load_data,
      $.declare_variable_statement,
      $.set_variable_statement,
      $.call_statement,
      $.grant_statement,
      $.revoke_statement,
      // inherited Hive role DDL
      $.grant_role,
      $.revoke_role,
      $.set_role_statement,
    ),

    // Override set_statement to add scripting assignment: SET var = expr
    set_statement: $ => prec.right(choice(
      seq($.keyword_set, $.keyword_constraints, choice($.keyword_all, comma_list($.identifier, true)), choice($.keyword_deferred, $.keyword_immediate)),
      seq($.keyword_set, $.keyword_transaction, $._transaction_mode),
      seq($.keyword_set, $.keyword_transaction, $.keyword_snapshot, $._transaction_mode),
      seq($.keyword_set, $.keyword_session, $.keyword_characteristics, $.keyword_as, $.keyword_transaction, $._transaction_mode),
      seq($.keyword_set, $.object_reference, '=', $._expression),
    )),

    // Override _type to add VARIANT. $.tinyint must be repeated from hive:
    // an override replaces the parent rule wholesale, so omitting it here
    // would drop TINYINT for spark and databricks even though hive has it.
    _type: $ => prec.left(
      choice(
        $.keyword_variant,
        // Spark 4.2 geospatial types
        $.keyword_geometry,
        $.keyword_geography,
        $.tinyint,
        $.keyword_boolean,
        $.bit,
        $.binary,
        $.varbinary,
        $.smallint,
        $.int,
        $.bigint,
        $.decimal,
        $.numeric,
        $.double,
        $.float,
        $.char,
        $.varchar,
        $.nchar,
        $.nvarchar,
        $.keyword_date,
        $.time,
        $.timestamp,
        $.keyword_interval,
        $.keyword_json,
        $.keyword_xml,
        $.keyword_string,
        $.enum,
        field('custom_type', $.object_reference),
      ),
    ),

    // Override _expression to add collate and variant_path
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
      $.collate_expression,
      $.variant_path_expression,
    )),

    // Override when_clause to allow bare INSERT (no values) for MERGE BY SOURCE
    when_clause: $ => prec.left(seq(
      $.keyword_when,
      optional($.keyword_not),
      $.keyword_matched,
      optional(seq(
        $.keyword_by,
        $.keyword_source,
      )),
      optional(seq(
        $.keyword_and,
        optional_parenthesis(field('predicate', $._expression)),
      )),
      $.keyword_then,
      choice(
        $.keyword_delete,
        seq($.keyword_update, $._set_values),
        seq($.keyword_insert, optional($._insert_values)),
        optional($.where),
      ),
    )),

    // Spark SQL: INSERT {INTO|OVERWRITE} [TABLE] ref [PARTITION (...)] [BY NAME] …
    insert: $ => seq(
      choice(
        $.keyword_insert,
        $.keyword_replace
      ),
      optional($.keyword_ignore),
      optional(
        choice(
          $.keyword_into,
          $.keyword_overwrite,
        ),
      ),
      optional($.keyword_table),
      field('target', $.object_reference),
      optional($.table_partition),
      optional(
        seq(
          $.keyword_as,
          field('alias', $.identifier)
        ),
      ),
      optional(seq($.keyword_by, $.keyword_name)),
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

    // Plain keyword (no elevated precedence) so a column literally named
    // `name` still lexes as an identifier outside the INSERT … BY NAME context.
    keyword_name: _ => make_keyword("name"),
    // Database DDL vocabulary; all follow a keyword, never a name.
    keyword_dbproperties: _ => make_keyword("dbproperties"),
    keyword_namespace:    _ => make_keyword("namespace"),
    keyword_properties:   _ => make_keyword("properties"),
    keyword_purge:        _ => make_keyword("purge"),

    // Override term to support SELECT * EXCEPT
    term: $ => seq(
      field(
        'value',
        choice(
          $.all_fields,
          $._expression,
        ),
      ),
      optional($._alias),
      optional($.select_except_clause),
    ),

    // Override relation to support LATERAL subquery, PIVOT, and UNPIVOT
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          $.lateral_subquery,
          $.values,
        ),
        optional($.time_travel),
        optional($.tablesample),
        optional(choice($.pivot_clause, $.unpivot_clause)),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // Delta time travel: table {VERSION|TIMESTAMP} AS OF value (optionally FOR).
    time_travel: $ => seq(
      optional($.keyword_for),
      choice($.keyword_version, $.keyword_timestamp),
      $.keyword_as,
      $.keyword_of,
      $._expression,
    ),

    keyword_version: _ => token(prec(1, make_keyword("version"))),

    // Override from to add: LATERAL VIEW, QUALIFY, CLUSTER/DISTRIBUTE/SORT BY
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
          $.lateral_view,
        ),
      ),
      optional($.where),
      optional($.group_by),
      optional($.having),
      optional($.qualify),
      optional($.window_clause),
      optional($.order_by),
      optional(
        choice(
          $.cluster_by,
          $.distribute_by,
          $.sort_by,
        ),
      ),
      // Spark SQL paging is LIMIT-only; no ANSI OFFSET…FETCH FIRST.
      optional($.limit),
    ),

    _alter_specifications: $ => choice(
      $.add_partition,
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
      // Iceberg partition field operations
      seq($.keyword_add, $.keyword_partition, $.keyword_field, $.partition_transform),
      seq($.keyword_drop, $.keyword_partition, $.keyword_field, $.partition_transform),
      seq($.keyword_replace, $.keyword_partition, $.keyword_field, $.partition_transform,
          $.keyword_with, $.partition_transform),
      // Iceberg write order
      $.write_order,
      seq($.keyword_write, $.keyword_distributed, $.keyword_by, $.keyword_partition),
      // ALTER TABLE t {SET | UNSET} TBLPROPERTIES ('k' = 'v', …)
      // Spelled the same way as the ALTER VIEW action above: table_option on
      // SET, a bare name list on UNSET.
      seq($.keyword_set, $.keyword_tblproperties, paren_list($.table_option, true)),
      seq($.keyword_unset, $.keyword_tblproperties, paren_list($._expression, true)),
      seq($.keyword_set, $.keyword_serdeproperties, paren_list($.table_option, true)),
    ),

    tablesample: $ => seq(
      $.keyword_tablesample,
      '(',
      choice(
        seq($._natural_number, $.keyword_rows),
        seq($._natural_number, $.keyword_percent),
        seq($.keyword_bucket, $._natural_number, $.keyword_out, $.keyword_of, $._natural_number),
      ),
      ')',
    ),

    // Spark/Hive-specific keywords (not ANSI)
    keyword_overwrite:          _ => token(prec(1, make_keyword("overwrite"))),
    keyword_clustered:          _ => token(prec(1, make_keyword("clustered"))),
    keyword_buckets:            _ => token(prec(1, make_keyword("buckets"))),
    keyword_tblproperties:      _ => token(prec(1, make_keyword("tblproperties"))),
    keyword_format:             _ => token(prec(1, make_keyword("format"))),
    keyword_delimited:          _ => token(prec(1, make_keyword("delimited"))),
    keyword_delimiter:          _ => token(prec(1, make_keyword("delimiter"))),
    keyword_fields:             _ => token(prec(1, make_keyword("fields"))),
    keyword_terminated:         _ => token(prec(1, make_keyword("terminated"))),
    keyword_escaped:            _ => token(prec(1, make_keyword("escaped"))),
    keyword_lines:              _ => token(prec(1, make_keyword("lines"))),
    keyword_parquet:            _ => token(prec(1, make_keyword("parquet"))),
    keyword_rcfile:             _ => token(prec(1, make_keyword("rcfile"))),
    keyword_csv:                _ => token(prec(1, make_keyword("csv"))),
    keyword_textfile:           _ => token(prec(1, make_keyword("textfile"))),
    keyword_avro:               _ => token(prec(1, make_keyword("avro"))),
    keyword_sequencefile:       _ => token(prec(1, make_keyword("sequencefile"))),
    keyword_orc:                _ => token(prec(1, make_keyword("orc"))),
    keyword_jsonfile:           _ => token(prec(1, make_keyword("jsonfile"))),
    keyword_stored:             _ => token(prec(1, make_keyword("stored"))),
    keyword_virtual:            _ => token(prec(1, make_keyword("virtual"))),
    keyword_cached:             _ => token(prec(1, make_keyword("cached"))),
    keyword_uncached:           _ => token(prec(1, make_keyword("uncached"))),
    keyword_replication:        _ => token(prec(1, make_keyword("replication"))),
    keyword_compute:            _ => token(prec(1, make_keyword("compute"))),
    keyword_stats:              _ => token(prec(1, make_keyword("stats"))),
    keyword_optimize:           _ => token(prec(1, make_keyword("optimize"))),
    keyword_zorder:             _ => token(prec(1, make_keyword("zorder"))),
    keyword_rewrite:            _ => token(prec(1, make_keyword("rewrite"))),
    keyword_bin_pack:           _ => token(prec(1, make_keyword("bin_pack"))),
    keyword_incremental:        _ => token(prec(1, make_keyword("incremental"))),
    keyword_statistics:         _ => token(prec(1, make_keyword("statistics"))),
    keyword_location:           _ => token(prec(1, make_keyword("location"))),
    keyword_partitioned:        _ => token(prec(1, make_keyword("partitioned"))),
    keyword_sort:               _ => token(prec(1, make_keyword("sort"))),
    keyword_sorted:             _ => token(prec(1, make_keyword("sorted"))),
    keyword_metadata:           _ => token(prec(1, make_keyword("metadata"))),
    keyword_noscan:             _ => token(prec(1, make_keyword("noscan"))),
    keyword_ignore:             _ => token(prec(1, make_keyword("ignore"))),
    keyword_rlike:              _ => token(prec(1, choice(make_keyword("rlike"), make_keyword("regexp")))),
    keyword_schedule:           _ => token(prec(1, make_keyword("schedule"))),
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
    keyword_returned_sqlstate:  _ => token(prec(1, make_keyword("returned_sqlstate"))),
    keyword_message_text:       _ => token(prec(1, make_keyword("message_text"))),
    keyword_message:            _ => token(prec(1, make_keyword("message"))),
    keyword_condition:          _ => token(prec(1, make_keyword("condition"))),
    keyword_get:                _ => token(prec(1, make_keyword("get"))),
    keyword_qualify:            _ => token(prec(1, make_keyword("qualify"))),
    keyword_pivot:              _ => token(prec(1, make_keyword("pivot"))),
    keyword_unpivot:            _ => token(prec(1, make_keyword("unpivot"))),
    keyword_bucket:             _ => token(prec(1, make_keyword("bucket"))),
    keyword_cluster:            _ => token(prec(1, make_keyword("cluster"))),
    keyword_distribute:         _ => token(prec(1, make_keyword("distribute"))),
    keyword_transform:          _ => token(prec(1, make_keyword("transform"))),
    keyword_var:                _ => token(prec(1, make_keyword("var"))),
    keyword_variable:           _ => token(prec(1, make_keyword("variable"))),
    keyword_variant:            _ => token(prec(1, make_keyword("variant"))),
    // Override base keyword_varchar to bypass state-dependent keyword extraction;
    // the "character varying" form is dropped in favour of consistent lexing.
    keyword_varchar:            _ => token(prec(1, make_keyword("varchar"))),
    keyword_string:             _ => token(prec(1, make_keyword("string"))),
    keyword_inpath:             _ => token(prec(1, make_keyword("inpath"))),
    keyword_directory:          _ => token(prec(1, make_keyword("directory"))),
    keyword_load:               _ => token(prec(1, make_keyword("load"))),
    keyword_changes:            _ => token(prec(1, make_keyword("changes"))),
    keyword_oids:               _ => token(prec(1, make_keyword("oids"))),
    keyword_delta:              _ => token(prec(1, make_keyword("delta"))),
    keyword_source:             _ => token(prec(1, make_keyword("source"))),
    keyword_shallow:            _ => token(prec(1, make_keyword("shallow"))),
    keyword_deep:               _ => token(prec(1, make_keyword("deep"))),
    keyword_clone:              _ => token(prec(1, make_keyword("clone"))),
    keyword_field:              _ => token(prec(1, make_keyword("field"))),
    keyword_call:               _ => token(prec(1, make_keyword("call"))),
    keyword_ordered:            _ => token(prec(1, make_keyword("ordered"))),
    keyword_options:            _ => token(prec(1, make_keyword("options"))),
    keyword_distributed:        _ => token(prec(1, make_keyword("distributed"))),
    keyword_columns:            _ => token(prec(1, make_keyword("columns"))),
    keyword_unset:              _ => token(prec(1, make_keyword("unset"))),
    keyword_declare:            _ => token(prec(1, make_keyword("declare"))),

    ...spark_create_rules,
    ...spark_optimize_rules,
    ...spark_spark4_rules,
    ...spark_scripting_rules,
    ...spark_iceberg_rules,
    ...spark_select_rules,
    ...spark_cache_rules,
    ...spark_resource_rules,
    // last, so its overrides win over the inherited rules
    ...spark_clause_rules,

    // Keywords for the cache / resource statements moved up from databricks.
    // file/files, jar/jars and archive/archives are prefix pairs, but both
    // members sit at the SAME token precedence, so longest match decides;
    // the TRAN/TRANSACTION trap only bites when the shorter word is given
    // higher precedence than the longer one.
    keyword_lazy:       _ => token(prec(1, make_keyword("lazy"))),
    keyword_clear:      _ => token(prec(1, make_keyword("clear"))),
    keyword_uncache:    _ => token(prec(1, make_keyword("uncache"))),
    keyword_file:       _ => token(prec(1, make_keyword("file"))),
    keyword_files:      _ => token(prec(1, make_keyword("files"))),
    keyword_jars:       _ => token(prec(1, make_keyword("jars"))),
    keyword_archive:    _ => token(prec(1, make_keyword("archive"))),
    keyword_archives:   _ => token(prec(1, make_keyword("archives"))),
    keyword_list:       _ => token(prec(1, make_keyword("list"))),
    keyword_collations: _ => token(prec(1, make_keyword("collations"))),
    keyword_geometry:   _ => token(prec(1, make_keyword("geometry"))),
    keyword_geography:  _ => token(prec(1, make_keyword("geography"))),
    keyword_query:      _ => token(prec(1, make_keyword("query"))),
    // SET PATH path elements. default_path/system_path are distinct words,
    // not PATH with a prefix, so no shadowing against keyword_path.
    keyword_path:             _ => token(prec(1, make_keyword("path"))),
    keyword_default_path:     _ => token(prec(1, make_keyword("default_path"))),
    keyword_system_path:      _ => token(prec(1, make_keyword("system_path"))),
    keyword_current_schema:   _ => token(prec(1, make_keyword("current_schema"))),
    keyword_current_database: _ => token(prec(1, make_keyword("current_database"))),

    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_called: _ => token(prec(1, make_keyword("called"))),
    keyword_repeatable: _ => token(prec(1, make_keyword("repeatable"))),
    keyword_variadic: _ => token(prec(1, make_keyword("variadic"))),
    keyword_varbinary: _ => token(prec(1, make_keyword("varbinary"))),
    keyword_varying: _ => token(prec(1, make_keyword("varying"))),

  },
}));
