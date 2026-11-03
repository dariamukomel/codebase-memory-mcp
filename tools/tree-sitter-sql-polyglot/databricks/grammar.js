import spark from '../spark/grammar.js';
import { optional_parenthesis, paren_list, comma_list, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';

import vacuum_rules   from './grammar/vacuum.js';
import restore_rules  from './grammar/restore.js';
import grant_rules    from './grammar/grant.js';
import drop_rules     from './grammar/drop.js';
import describe_rules from './grammar/describe.js';
import show_rules     from './grammar/show.js';
import cache_rules    from './grammar/cache.js';
import call_rules     from './grammar/call.js';
import create_rules   from './grammar/create.js';
import alter_rules    from './grammar/alter.js';
import apply_rules    from './grammar/apply.js';

export default canonicalOrder(grammar(spark, {
  name: 'databricks_sql',

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
    // Inherited from Hive via Spark: multi-table INSERT ambiguity
    [$.select, $.multi_table_insert],
    [$.lateral_cross_join],
    // Inherited from Hive via Spark: SERDE optional WITH SERDEPROPERTIES ambiguity
    [$.row_format],
    [$.lateral_view],
  ],

  rules: {

    _ddl_statement: $ => choice(
      // Base ANSI SQL DDL
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
      // Databricks / Delta / Unity Catalog
      $.restore_table_statement,
      $.convert_to_delta_statement,
      $.fsck_repair_statement,
      $.reorg_table_statement,
      $.generate_statement,
      $.msck_repair_statement,
      $.grant_statement,
      $.revoke_statement,
      $.deny_statement,
      $.copy_into_statement,
      // Databricks / Spark UNLOAD (Athena)
      $._unload_statement,
      // Databricks CACHE
      $.cache_table,
      $.uncache_table,
      $.clear_cache,
      // Databricks DESCRIBE
      $.describe_table,
      $.describe_history,
      $.describe_detail,
      $.describe_uc_object,
      $.describe_query,
      // Databricks resource management
      $.add_resource_statement,
      $.list_resource_statement,
      // Databricks CALL + EXECUTE IMMEDIATE
      $.call_statement,
      $.execute_immediate_statement,
      // Databricks APPLY CHANGES (DLT)
      $.apply_changes_statement,
      // Databricks SHOW
      $._show_statement,
      // Databricks CREATE extensions
      $.create_namespace,
      $.create_streaming_table,
      $.create_live_table,
      $.create_table_like,
      $.create_catalog,
      $.create_volume,
      $.create_connection,
      $.create_credential,
      $.create_external_location,
      $.create_share,
      $.create_recipient,
      $.create_provider,
      $.create_policy,
      // Previously missing Databricks statements
      $.undrop_statement,
      $.create_server,
      $.drop_bloomfilter_index,
    ),

    _optimize_statement: $ => choice(
      $._optimize_table,   // Iceberg (from base via spark)
      $._compute_stats,    // Hive/Impala (from spark)
      $._spark_analyze,    // Spark ANALYZE (from spark)
      $._delta_optimize,   // Delta Lake (from spark)
      $._vacuum_table,     // Databricks Delta vacuum
    ),

    _refresh_statement: $ => choice(
      $.refresh_materialized_view,
      $.refresh_table_databricks,
      $.refresh_function,
    ),

    _show_statement: $ => seq(
      $.keyword_show,
      choice(
        $._show_create,
        $.keyword_all,
        $._show_tables,
        $._show_catalogs,
        $._show_namespaces,
        $._show_volumes,
        $._show_grants,
        $._show_uc_object_type,
        $._show_procedures,
        $._show_tables_dropped,
        $._show_tblproperties,
        $._show_partitions,
        $._show_columns,
      ),
    ),

    _drop_statement: $ => choice(
      // Base drops
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
      // Databricks drops
      $.drop_catalog,
      $.drop_namespace,
      $.drop_connection,
      $.drop_credential,
      $.drop_external_location,
      $.drop_volume,
      $.drop_share,
      $.drop_recipient,
      $.drop_provider,
      $.drop_policy,
    ),

    // Override Spark's table_partition to support Iceberg-style transforms.
    table_partition: $ => seq(
      choice(
        seq($.keyword_partition, $.keyword_by, choice($.keyword_range, $.keyword_hash)),
        seq($.keyword_partitioned, $.keyword_by),
        $.keyword_partition,
      ),
      choice(
        paren_list($.partition_field, true),
        $.column_definitions,
        paren_list($._key_value_pair, true),
      ),
    ),

    // Override _alter_specifications to add Iceberg/Unity Catalog specs
    _alter_specifications: $ => choice(
      // Base ANSI specs
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
      // Spark iceberg partition field operations (inherited from spark, kept here to avoid regression)
      seq($.keyword_add, $.keyword_partition, $.keyword_field, $.partition_transform),
      seq($.keyword_drop, $.keyword_partition, $.keyword_field, $.partition_transform),
      seq($.keyword_replace, $.keyword_partition, $.keyword_field, $.partition_transform,
          $.keyword_with, $.partition_transform),
      // Spark iceberg write order (must be kept so ALTER TABLE ... WRITE ORDERED BY still parses)
      $.write_order,
      seq($.keyword_write, $.keyword_distributed, $.keyword_by, $.keyword_partition),
      // Iceberg / Unity Catalog specs
      $._alter_table_iceberg_spec,
      // Liquid clustering: CLUSTER BY (col, …) | CLUSTER BY NONE
      seq($.keyword_cluster, $.keyword_by, choice(paren_list($.identifier, true), $.keyword_none)),
    ),

    // Override set_statement to add Databricks-specific SET forms
    set_statement: $ => prec.right(choice(
      // Inherited from Spark
      seq($.keyword_set, $.keyword_constraints, choice($.keyword_all, comma_list($.identifier, true)), choice($.keyword_deferred, $.keyword_immediate)),
      seq($.keyword_set, $.keyword_transaction, $._transaction_mode),
      seq($.keyword_set, $.keyword_transaction, $.keyword_snapshot, $._transaction_mode),
      seq($.keyword_set, $.keyword_session, $.keyword_characteristics, $.keyword_as, $.keyword_transaction, $._transaction_mode),
      seq($.keyword_set, $.object_reference, '=', $._expression),
      // Databricks-specific
      seq($.keyword_set, $.keyword_catalog, $.object_reference),
      seq($.keyword_set, optional($.keyword_global), $.keyword_time, $.keyword_zone, choice($._expression, $.keyword_local)),
    )),

    // Databricks-specific keywords (not in Spark, not ANSI)
    keyword_retain:     _ => token(prec(1, make_keyword("retain"))),
    keyword_hours:      _ => token(prec(1, make_keyword("hours"))),
    keyword_dry:        _ => token(prec(1, make_keyword("dry"))),
    keyword_run:        _ => token(prec(1, make_keyword("run"))),
    keyword_restore:    _ => token(prec(1, make_keyword("restore"))),
    keyword_convert:    _ => token(prec(1, make_keyword("convert"))),
    keyword_fsck:       _ => token(prec(1, make_keyword("fsck"))),
    keyword_repair:     _ => token(prec(1, make_keyword("repair"))),
    keyword_reorg:      _ => token(prec(1, make_keyword("reorg"))),
    keyword_cron:       _ => token(prec(1, make_keyword("cron"))),
    keyword_every:      _ => token(prec(1, make_keyword("every"))),
    keyword_at:         _ => token(prec(1, make_keyword("at"))),
    keyword_apply:      _ => token(prec(1, make_keyword("apply"))),
    keyword_purge:      _ => token(prec(1, make_keyword("purge"))),
    keyword_generate:   _ => token(prec(1, make_keyword("generate"))),
    keyword_msck:       _ => token(prec(1, make_keyword("msck"))),
    keyword_partitions: _ => token(prec(1, make_keyword("partitions"))),
    keyword_sync:       _ => token(prec(1, make_keyword("sync"))),
    keyword_grant:      _ => token(prec(1, make_keyword("grant"))),
    keyword_revoke:     _ => token(prec(1, make_keyword("revoke"))),
    keyword_deny:       _ => token(prec(1, make_keyword("deny"))),
    keyword_privileges: _ => token(prec(1, make_keyword("privileges"))),
    keyword_service:    _ => token(prec(1, make_keyword("service"))),
    keyword_principal:  _ => token(prec(1, make_keyword("principal"))),
    keyword_recipient:  _ => token(prec(1, make_keyword("recipient"))),
    keyword_metastore:  _ => token(prec(1, make_keyword("metastore"))),
    keyword_volume:     _ => token(prec(1, make_keyword("volume"))),
    keyword_credential: _ => token(prec(1, make_keyword("credential"))),
    keyword_share:      _ => token(prec(1, make_keyword("share"))),
    keyword_copy:          _ => token(prec(1, make_keyword("copy"))),
    keyword_fileformat:    _ => token(prec(1, make_keyword("fileformat"))),
    keyword_pattern:       _ => token(prec(1, make_keyword("pattern"))),
    keyword_validate:      _ => token(prec(1, make_keyword("validate"))),
    keyword_format_options: _ => token(prec(1, /[Ff][Oo][Rr][Mm][Aa][Tt]_[Oo][Pp][Tt][Ii][Oo][Nn][Ss]/)),
    keyword_copy_options:   _ => token(prec(1, /[Cc][Oo][Pp][Yy]_[Oo][Pp][Tt][Ii][Oo][Nn][Ss]/)),

    // COPY INTO t FROM {'src' | (SELECT … FROM 'src')}
    //   [FILEFORMAT = fmt] [VALIDATE …] [PATTERN = 'glob'] [FILES = ('a','b')]
    //   [FORMAT_OPTIONS (…)] [COPY_OPTIONS (…)]
    copy_into_statement: $ => seq(
      $.keyword_copy,
      $.keyword_into,
      $.object_reference,
      $.keyword_from,
      choice(
        alias($._literal_string, $.literal),
        wrapped_in_parenthesis($._dml_read),
      ),
      repeat(choice(
        seq($.keyword_fileformat, '=', $.identifier),
        seq($.keyword_pattern, '=', alias($._literal_string, $.literal)),
        seq($.keyword_files, '=', paren_list(alias($._literal_string, $.literal), true)),
        seq($.keyword_format_options, paren_list($._copy_option, true)),
        seq($.keyword_copy_options, paren_list($._copy_option, true)),
        seq($.keyword_validate, optional($.keyword_all), optional($._dml_read)),
      )),
    ),

    _copy_option: $ => seq(
      alias($._literal_string, $.literal),
      '=',
      alias($._literal_string, $.literal),
    ),
    keyword_catalog:    _ => token(prec(1, make_keyword("catalog"))),
    keyword_describe:   _ => token(prec(1, make_keyword("describe"))),
    keyword_call:       _ => token(prec(1, make_keyword("call"))),
    keyword_branch:     _ => token(prec(1, make_keyword("branch"))),
    keyword_tag:        _ => token(prec(1, make_keyword("tag"))),
    keyword_identity:   _ => token(prec(1, make_keyword("identity"))),
    keyword_position:   _ => token(prec(1, make_keyword("position"))),
    keyword_distributed:_ => token(prec(1, make_keyword("distributed"))),
    keyword_ordered:    _ => token(prec(1, make_keyword("ordered"))),
    keyword_namespace:  _ => token(prec(1, make_keyword("namespace"))),
    keyword_streaming:  _ => token(prec(1, make_keyword("streaming"))),
    keyword_live:       _ => token(prec(1, make_keyword("live"))),
    keyword_provider:   _ => token(prec(1, make_keyword("provider"))),
    keyword_options:    _ => token(prec(1, make_keyword("options"))),
    keyword_url:        _ => token(prec(1, make_keyword("url"))),
    keyword_grants:     _ => token(prec(1, make_keyword("grants"))),
    keyword_history:    _ => token(prec(1, make_keyword("history"))),
    keyword_detail:     _ => token(prec(1, make_keyword("detail"))),
    keyword_global:     _ => token(prec(1, make_keyword("global"))),
    keyword_handler:    _ => token(prec(1, make_keyword("handler"))),
    keyword_environment:_ => token(prec(1, make_keyword("environment"))),
    keyword_parameter:  _ => token(prec(1, make_keyword("parameter"))),
    keyword_style:      _ => token(prec(1, make_keyword("style"))),
    keyword_shallow:    _ => token(prec(1, make_keyword("shallow"))),
    keyword_deep:       _ => token(prec(1, make_keyword("deep"))),
    keyword_clone:      _ => token(prec(1, make_keyword("clone"))),
    keyword_catalogs:   _ => token(prec(1, make_keyword("catalogs"))),
    keyword_namespaces: _ => token(prec(1, make_keyword("namespaces"))),
    keyword_volumes:    _ => token(prec(1, make_keyword("volumes"))),
    keyword_connections:_ => token(prec(1, make_keyword("connections"))),
    keyword_credentials:_ => token(prec(1, make_keyword("credentials"))),
    keyword_shares:     _ => token(prec(1, make_keyword("shares"))),
    keyword_recipients: _ => token(prec(1, make_keyword("recipients"))),
    keyword_providers:  _ => token(prec(1, make_keyword("providers"))),
    // Previously missing statements (UNDROP, CREATE SERVER, bloom filter
    // indexes, and the SHOW object types). procedure/procedures and
    // location/locations are prefix pairs but sit at equal precedence, so
    // longest match resolves them.
    keyword_undrop:     _ => token(prec(1, make_keyword("undrop"))),
    keyword_id:         _ => token(prec(1, make_keyword("id"))),
    keyword_server:     _ => token(prec(1, make_keyword("server"))),
    keyword_bloomfilter: _ => token(prec(1, make_keyword("bloomfilter"))),
    keyword_users:      _ => token(prec(1, make_keyword("users"))),
    keyword_policies:   _ => token(prec(1, make_keyword("policies"))),
    keyword_locations:  _ => token(prec(1, make_keyword("locations"))),
    keyword_procedures: _ => token(prec(1, make_keyword("procedures"))),
    keyword_dropped:    _ => token(prec(1, make_keyword("dropped"))),
    keyword_appends:    _ => token(prec(1, make_keyword("appends"))),
    keyword_upsert:     _ => token(prec(1, make_keyword("upsert"))),
    keyword_vacuum:     _ => token(prec(1, make_keyword("vacuum"))),
    keyword_policy:     _ => token(prec(1, make_keyword("policy"))),
    keyword_show:       _ => token(prec(1, make_keyword("show"))),
    keyword_unload:     _ => token(prec(1, make_keyword("unload"))),
    keyword_keys:       _ => token(prec(1, make_keyword("keys"))),
    keyword_extended:   _ => token(prec(1, make_keyword("extended"))),
    keyword_version:    _ => token(prec(1, make_keyword("version"))),
    keyword_flow:       _ => token(prec(1, make_keyword("flow"))),
    keyword_names:      _ => token(prec(1, make_keyword("names"))),

    // Databricks-specific rule definitions
    ...vacuum_rules,
    ...restore_rules,
    ...grant_rules,
    ...drop_rules,
    ...describe_rules,
    ...show_rules,
    ...cache_rules,
    ...call_rules,
    ...create_rules,
    ...alter_rules,
    ...apply_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_called: _ => token(prec(1, make_keyword("called"))),
    keyword_generated: _ => token(prec(1, make_keyword("generated"))),

  },
}));
