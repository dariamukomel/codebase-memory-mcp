import base from '../grammar.js';
import { paren_list, optional_parenthesis, comma_list, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import { createStatementChoices } from './grammar/legacy_statements.js';
import hive_storage_rules from './grammar/storage.js';
import hive_partition_rules from './grammar/partition.js';
import hive_lateral_view_rules from './grammar/lateral_view.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'hive_sql',

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
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
    [$.stored_by],
    [$.row_format],
    [$.skewed_by],
    [$.select, $.multi_table_insert],
    // Removed as unnecessary (tree-sitter reports them and each one still
    // costs GLR-split states): [$._column, $._qualified_field],
    // [$.cluster_by], [$.distribute_by], [$.sort_by], [$.multi_table_insert].
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // Re-add non-ANSI CREATE forms this dialect supports over the strict ANSI base.
    _create_statement: $ => seq(choice(...createStatementChoices($, { materializedView: true }))),

    // HiveQL supports the EXPLAIN prefix (re-added over the strict ANSI base).
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
      ),
    ),

    // Hive DDL: no Spark 4.x variable statements, no scripting constructs,
    // no Iceberg-specific statements.  MSCK REPAIR TABLE is Hive/Impala-specific.
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.comment_statement,
      $.set_statement,
      $.reset_statement,
      $.use_statement,
      $.msck_repair_statement,
      $.load_data,
      $.grant_statement,
      $.revoke_statement,
      $.grant_role,
      $.revoke_role,
      $.set_role_statement,
      $.show_statement,
      $.describe_statement,
      $.export_statement,
      $.import_statement,
      $.create_temporary_macro,
      // Hive 4 data connectors + transaction administration
      $.create_connector,
      $.alter_connector,
      $.drop_connector,
      $.abort_transactions_statement,
    ),

    // TINYINT is a Hive/Spark column type absent from the strict ANSI base,
    // so _type is re-enumerated here to add it. Inherited by spark and
    // databricks, which is why `CREATE TABLE t (a TINYINT)` previously failed
    // in all three.
    _type: $ => prec.left(
      choice(
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

    tinyint: $ => $.keyword_tinyint,

    // CREATE CONNECTOR name TYPE 'type' URL 'url' [COMMENT '…']
    //   [WITH DCPROPERTIES (k=v, …)]
    create_connector: $ => seq(
      $.keyword_create,
      $.keyword_connector,
      optional($._if_not_exists),
      field('name', $.identifier),
      optional(seq($.keyword_type, alias($._literal_string, $.literal))),
      optional(seq($.keyword_url, alias($._literal_string, $.literal))),
      optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
      optional(seq(
        $.keyword_with,
        $.keyword_dcproperties,
        paren_list($._key_value_pair, true),
      )),
    ),

    // ALTER CONNECTOR name SET { DCPROPERTIES (…) | URL '…' | OWNER … }
    alter_connector: $ => seq(
      $.keyword_alter,
      $.keyword_connector,
      field('name', $.identifier),
      $.keyword_set,
      choice(
        seq($.keyword_dcproperties, paren_list($._key_value_pair, true)),
        seq($.keyword_url, alias($._literal_string, $.literal)),
        seq($.keyword_owner, choice($.keyword_user, $.keyword_role), $.identifier),
      ),
    ),

    drop_connector: $ => seq(
      $.keyword_drop,
      $.keyword_connector,
      optional($._if_exists),
      field('name', $.identifier),
    ),

    // ABORT TRANSACTIONS id [ id … ]
    abort_transactions_statement: $ => seq(
      $.keyword_abort,
      $.keyword_transactions,
      repeat1(alias($._natural_number, $.literal)),
    ),

    // GRANT ROLE r [, …] TO {USER|GROUP|ROLE} name [, …]
    grant_role: $ => seq(
      $.keyword_grant,
      $.keyword_role,
      comma_list($.identifier, true),
      $.keyword_to,
      choice($.keyword_user, $.keyword_group, $.keyword_role),
      comma_list($.identifier, true),
    ),

    // REVOKE ROLE r [, …] FROM {USER|GROUP|ROLE} name [, …]
    revoke_role: $ => seq(
      $.keyword_revoke,
      $.keyword_role,
      comma_list($.identifier, true),
      $.keyword_from,
      choice($.keyword_user, $.keyword_group, $.keyword_role),
      comma_list($.identifier, true),
    ),

    // SET ROLE {name | ALL | NONE}
    set_role_statement: $ => seq(
      $.keyword_set,
      $.keyword_role,
      choice($.keyword_all, $.keyword_none, $.identifier),
    ),

    keyword_roles: _ => token(prec(1, make_keyword("roles"))),

    // EXPORT TABLE t [PARTITION (…)] TO 'hdfs_path'
    export_statement: $ => seq(
      $.keyword_export,
      $.keyword_table,
      field('target', $.object_reference),
      optional(seq($.keyword_partition, paren_list(seq($.identifier, '=', $._expression), true))),
      $.keyword_to,
      alias($._literal_string, $.literal),
    ),

    // IMPORT [[EXTERNAL] TABLE t [PARTITION (…)]] FROM 'hdfs_path' [LOCATION 'path']
    import_statement: $ => seq(
      $.keyword_import,
      optional(seq(
        optional($.keyword_external),
        $.keyword_table,
        $.object_reference,
        optional(seq($.keyword_partition, paren_list(seq($.identifier, '=', $._expression), true))),
      )),
      $.keyword_from,
      alias($._literal_string, $.literal),
      optional(seq($.keyword_location, alias($._literal_string, $.literal))),
    ),

    // CREATE TEMPORARY MACRO name(param type, …) body_expression
    create_temporary_macro: $ => seq(
      $.keyword_create,
      $.keyword_temporary,
      $.keyword_macro,
      $.identifier,
      '(',
      comma_list(seq($.identifier, $._type), false),
      ')',
      $._expression,
    ),

    keyword_export: _ => token(prec(1, make_keyword("export"))),
    keyword_import: _ => token(prec(1, make_keyword("import"))),
    keyword_macro:  _ => token(prec(1, make_keyword("macro"))),

    // Override _dml_write to include Hive's multi-table insert and overwrite-directory
    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
        $._truncate_statement,
        $.multi_table_insert,
        $.insert_overwrite_directory,
      ),
    ),

    // LOAD DATA [LOCAL] INPATH 'path' [OVERWRITE] INTO TABLE tbl [PARTITION (key=val)]
    load_data: $ => seq(
      $.keyword_load,
      $.keyword_data,
      optional($.keyword_local),
      $.keyword_inpath,
      alias($._literal_string, $.literal),
      optional($.keyword_overwrite),
      $.keyword_into,
      $.keyword_table,
      $.object_reference,
      optional($.table_partition),
    ),

    // INSERT OVERWRITE [LOCAL] DIRECTORY 'path' [ROW FORMAT ...] [STORED AS ...]
    // SELECT ...
    insert_overwrite_directory: $ => seq(
      $.keyword_insert,
      $.keyword_overwrite,
      optional($.keyword_local),
      $.keyword_directory,
      alias($._literal_string, $.literal),
      repeat(
        choice(
          $.row_format,
          $.stored_as,
        ),
      ),
      $._dml_read,
    ),

    // FROM src INSERT [OVERWRITE] [INTO] TABLE tbl [PARTITION] SELECT/VALUES ...
    // (one or more INSERT targets in a single scan)
    multi_table_insert: $ => seq(
      $.keyword_from,
      $.object_reference,
      optional($._alias),
      repeat1(
        seq(
          $.keyword_insert,
          optional(choice($.keyword_overwrite, $.keyword_into)),
          optional($.keyword_table),
          $.object_reference,
          optional($.table_partition),
          choice(
            seq($.keyword_select, $.select_expression, optional($.where)),
            $._insert_values,
          ),
        ),
      ),
    ),

    // CREATE TABLE with EXTERNAL support and HiveQL table settings
    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional(
          choice(
            $._temporary,
            $.keyword_external,
          ),
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

    // Hive _table_settings: hive_compat storage rules + Hive-specific STORED BY / SKEWED BY.
    // No shallow_clone (Databricks-only).
    _table_settings: $ => choice(
      $.table_partition,
      $.stored_as,
      $.stored_by,
      $.storage_location,
      $.table_sort,
      $.table_cluster,
      $.row_format,
      $.skewed_by,
      seq($.keyword_tblproperties, paren_list($.table_option, true)),
      seq($.keyword_without, $.keyword_oids),
      $.storage_parameters,
      $.table_option,
    ),

    // INSERT OVERWRITE ... PARTITION (key=val); core HiveQL DML
    insert: $ => seq(
      $.keyword_insert,
      optional($.keyword_ignore),
      optional(
        choice(
          $.keyword_into,
          $.keyword_overwrite,
        ),
      ),
      field('target', $.object_reference),
      optional($.table_partition),
      optional(
        seq(
          $.keyword_as,
          field('alias', $.identifier),
        ),
      ),
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

    // ALTER TABLE specifications: add_partition (from hive_compat) but no Iceberg ops
    // CREATE {DATABASE | SCHEMA} [IF NOT EXISTS] name
    //   [COMMENT c] [LOCATION path] [WITH DBPROPERTIES ('k' = 'v', …)]
    // DATABASE only: base already defines create_schema for the SCHEMA
    // spelling, and accepting both here made the two rules ambiguous.
    create_database: $ => prec.left(seq(
      $.keyword_create,
      $.keyword_database,
      optional($._if_not_exists),
      $.identifier,
      repeat(choice(
        seq($.keyword_comment, field('comment', $.literal)),
        seq($.keyword_location, field('location', $.literal)),
        seq($.keyword_with, $.keyword_dbproperties, paren_list($.table_option, true)),
      )),
    )),

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
      $.exchange_partition,
      $.concatenate_partition,
      $.compact_partition,
      // ALTER TABLE t {SET | UNSET} TBLPROPERTIES ('k' = 'v', …)
      // Spelled the same way as the ALTER VIEW action above: table_option on
      // SET, a bare name list on UNSET.
      seq($.keyword_set, $.keyword_tblproperties, paren_list($.table_option, true)),
      seq($.keyword_unset, $.keyword_tblproperties, paren_list($._expression, true)),
      seq($.keyword_set, $.keyword_serdeproperties, paren_list($.table_option, true)),
    ),

    // ALTER TABLE t [PARTITION (k=v, …)] CONCATENATE (small-file compaction)
    concatenate_partition: $ => seq(
      optional(seq(
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
      )),
      $.keyword_concatenate,
    ),

    // ALTER TABLE t [PARTITION (k=v, …)] COMPACT 'major' [AND WAIT]
    //   [POOL 'p'] [WITH OVERWRITE TBLPROPERTIES ('k' = 'v', …)]
    // Hive's manual compaction request for full/insert-only ACID tables. The
    // compaction type ('major' | 'minor' | 'rebalance') is a string literal,
    // not a keyword.
    compact_partition: $ => seq(
      optional(seq(
        $.keyword_partition,
        paren_list(seq($.identifier, '=', $._expression), true),
      )),
      $.keyword_compact,
      field('type', alias($._literal_string, $.literal)),
      optional(seq($.keyword_and, $.keyword_wait)),
      optional(seq($.keyword_pool, field('pool', alias($._literal_string, $.literal)))),
      optional(seq(
        $.keyword_with,
        $.keyword_overwrite,
        $.keyword_tblproperties,
        paren_list($.table_option, true),
      )),
    ),

    // FROM with LATERAL VIEW, CLUSTER/DISTRIBUTE/SORT BY support
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
      optional($.window_clause),
      optional($.order_by),
      optional(
        choice(
          $.cluster_by,
          $.distribute_by,
          $.sort_by,
        ),
      ),
      // HiveQL paging is LIMIT-only; no ANSI OFFSET…FETCH FIRST.
      optional($.limit),
    ),

    // CLUSTER BY col [, col]
    cluster_by: $ => seq(
      $.keyword_cluster,
      $.keyword_by,
      comma_list($._expression, true),
    ),

    // DISTRIBUTE BY col [, col]
    distribute_by: $ => seq(
      $.keyword_distribute,
      $.keyword_by,
      comma_list($._expression, true),
    ),

    // SORT BY col [ASC|DESC] [, col]
    sort_by: $ => seq(
      $.keyword_sort,
      $.keyword_by,
      comma_list($.order_target, true),
    ),

    // TABLESAMPLE with BUCKET n OUT OF n support (Hive-specific bucket sampling)
    tablesample: $ => seq(
      $.keyword_tablesample,
      '(',
      choice(
        seq($._natural_number, $.keyword_rows),
        seq($._natural_number, $.keyword_percent),
        seq(
          $.keyword_bucket, $._natural_number, $.keyword_out, $.keyword_of, $._natural_number,
          // Hive: BUCKET x OUT OF y ON {col | rand()}
          optional(seq($.keyword_on, choice($.identifier, $.invocation))),
        ),
      ),
      ')',
    ),

    // Hive/Databricks class-backed UDF: CREATE FUNCTION name AS 'class' [USING JAR 'path']
    create_function: $ => prec.left(seq(
      $.keyword_create,
      optional($._or_replace),
      $.keyword_function,
      optional($._if_not_exists),
      $.object_reference,
      choice(
        seq(
          $.function_arguments,
          optional(seq(
            $.keyword_returns,
            choice(
              $._type,
              seq($.keyword_setof, $._type),
              seq($.keyword_table, $.column_definitions),
              $.keyword_trigger,
            ),
          )),
          repeat(
            choice(
              $.function_language,
              $.function_volatility,
              $.function_leakproof,
              $.function_security,
              $.function_safety,
              $.function_strictness,
              $.function_cost,
              $.function_rows,
              $.function_support,
              $.function_handler,
              $.function_environment,
              $.function_parameter_style,
            ),
          ),
          optional($.function_body),
          repeat(
            choice(
              $.function_language,
              $.function_volatility,
              $.function_leakproof,
              $.function_security,
              $.function_safety,
              $.function_strictness,
              $.function_cost,
              $.function_rows,
              $.function_support,
              $.function_handler,
              $.function_environment,
              $.function_parameter_style,
            ),
          ),
        ),
        seq(
          $.keyword_as,
          field('class', alias($._literal_string, $.literal)),
          optional(seq($.keyword_using, $.keyword_jar, field('jar', alias($._literal_string, $.literal)))),
        ),
      ),
    )),

    function_handler: $ => seq(
      $.keyword_handler,
      alias($._literal_string, $.literal),
    ),

    function_environment: $ => seq(
      $.keyword_environment,
      '(',
      repeat(seq($.identifier, '=', alias($._literal_string, $.literal), optional(','))),
      ')',
    ),

    function_parameter_style: $ => seq(
      $.keyword_parameter,
      $.keyword_style,
      $.identifier,
    ),

    // SELECT TRANSFORM(cols) [ROW FORMAT ...] USING 'script' [AS (schema)] [ROW FORMAT ...]
    select: $ => seq(
      $.keyword_select,
      choice(
        seq(
          optional($.keyword_distinct),
          $.select_expression,
        ),
        $.transform_clause,
      ),
    ),

    transform_clause: $ => prec.right(seq(
      $.keyword_transform,
      paren_list($._expression, true),
      optional($.row_format),
      $.keyword_using,
      field('script', alias($._literal_string, $.literal)),
      optional(
        seq(
          $.keyword_as,
          choice(
            paren_list($.column_definition, true),
            comma_list($.identifier, true),
          ),
        ),
      ),
      optional($.row_format),
    )),

    // SHOW PARTITIONS / TABLES / DATABASES / SCHEMAS / FUNCTIONS
    show_statement: $ => prec.right(seq(
      $.keyword_show,
      choice(
        seq(
          $.keyword_partitions,
          $.object_reference,
          optional($.partition_spec),
        ),
        seq(
          $.keyword_tables,
          optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
          optional(seq(optional($.keyword_like), alias($._literal_string, $.literal))),
        ),
        seq(
          choice($.keyword_databases, $.keyword_schemas),
          optional(seq($.keyword_like, alias($._literal_string, $.literal))),
        ),
        seq(
          $.keyword_functions,
          optional(seq($.keyword_like, alias($._literal_string, $.literal))),
        ),
        // SHOW ROLES / SHOW CURRENT ROLES / SHOW ROLE GRANT {USER|GROUP|ROLE} n
        $.keyword_roles,
        seq($.keyword_current, $.keyword_roles),
        seq(
          $.keyword_role,
          $.keyword_grant,
          choice($.keyword_user, $.keyword_group, $.keyword_role),
          $.identifier,
        ),
        // ── Hive SHOW statements previously missing ──
        // SHOW VIEWS / MATERIALIZED VIEWS [ {FROM|IN} db ] [ LIKE pattern ]
        seq(
          choice(
            $.keyword_views,
            seq($.keyword_materialized, $.keyword_views),
          ),
          optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
          optional(seq(optional($.keyword_like), alias($._literal_string, $.literal))),
        ),
        // SHOW COLUMNS {FROM|IN} table [ {FROM|IN} db ] [ LIKE pattern ]
        seq(
          $.keyword_columns,
          choice($.keyword_from, $.keyword_in),
          $.object_reference,
          optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
          optional(seq(optional($.keyword_like), alias($._literal_string, $.literal))),
        ),
        // SHOW [FORMATTED] INDEXES ON table [ {FROM|IN} db ]
        seq(
          optional($.keyword_formatted),
          $.keyword_indexes,
          $.keyword_on,
          $.object_reference,
          optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
        ),
        // SHOW TBLPROPERTIES table [ ( 'name' ) ]
        seq(
          $.keyword_tblproperties,
          $.object_reference,
          optional(wrapped_in_parenthesis(alias($._literal_string, $.literal))),
        ),
        // SHOW LOCKS [ table [PARTITION (…)] ] [EXTENDED]
        seq(
          $.keyword_locks,
          optional($.object_reference),
          optional($.partition_spec),
          optional($.keyword_extended),
        ),
        // SHOW TRANSACTIONS / COMPACTIONS / CONNECTORS / CONF 'key'
        $.keyword_transactions,
        $.keyword_compactions,
        $.keyword_connectors,
        seq($.keyword_conf, alias($._literal_string, $.literal)),
      ),
    )),

    // DESCRIBE [FORMATTED|EXTENDED] table [PARTITION (...)] [col]
    describe_statement: $ => prec.right(seq(
      choice($.keyword_describe, $.keyword_desc),
      optional(choice($.keyword_formatted, $.keyword_extended)),
      $.object_reference,
      optional($.partition_spec),
      optional(field('column', $.identifier)),
    )),

    // PARTITION (key=value, ...); values may be any expression
    partition_spec: $ => seq(
      $.keyword_partition,
      paren_list(
        seq(field('key', $.identifier), '=', field('value', $._expression)),
        true,
      ),
    ),

    // ALTER TABLE target EXCHANGE PARTITION (spec) WITH TABLE source
    exchange_partition: $ => seq(
      $.keyword_exchange,
      $.partition_spec,
      $.keyword_with,
      $.keyword_table,
      $.object_reference,
    ),

    // Hive-specific keywords; token(prec(1,...)) so the lexer prefers these over
    // the base _identifier pattern when both are valid in a parse state.
    keyword_serde:           _ => token(prec(1, make_keyword("serde"))),
    keyword_serdeproperties: _ => token(prec(1, make_keyword("serdeproperties"))),
    keyword_unset:           _ => token(prec(1, make_keyword("unset"))),
    keyword_dbproperties:    _ => make_keyword("dbproperties"),
    keyword_skewed:          _ => token(prec(1, make_keyword("skewed"))),
    keyword_directories:     _ => token(prec(1, make_keyword("directories"))),
    keyword_stored:          _ => token(prec(1, make_keyword("stored"))),
    keyword_cached:          _ => token(prec(1, make_keyword("cached"))),
    keyword_uncached:        _ => token(prec(1, make_keyword("uncached"))),
    keyword_replication:     _ => token(prec(1, make_keyword("replication"))),
    keyword_tblproperties:   _ => token(prec(1, make_keyword("tblproperties"))),
    keyword_location:        _ => token(prec(1, make_keyword("location"))),
    keyword_partitioned:     _ => token(prec(1, make_keyword("partitioned"))),
    keyword_sort:            _ => token(prec(1, make_keyword("sort"))),
    keyword_sorted:          _ => token(prec(1, make_keyword("sorted"))),
    keyword_format:          _ => token(prec(1, make_keyword("format"))),
    keyword_delimited:       _ => token(prec(1, make_keyword("delimited"))),
    keyword_delimiter:       _ => token(prec(1, make_keyword("delimiter"))),
    keyword_fields:          _ => token(prec(1, make_keyword("fields"))),
    keyword_terminated:      _ => token(prec(1, make_keyword("terminated"))),
    keyword_escaped:         _ => token(prec(1, make_keyword("escaped"))),
    keyword_lines:           _ => token(prec(1, make_keyword("lines"))),
    keyword_parquet:         _ => token(prec(1, make_keyword("parquet"))),
    keyword_rcfile:          _ => token(prec(1, make_keyword("rcfile"))),
    keyword_csv:             _ => token(prec(1, make_keyword("csv"))),
    keyword_textfile:        _ => token(prec(1, make_keyword("textfile"))),
    keyword_avro:            _ => token(prec(1, make_keyword("avro"))),
    keyword_sequencefile:    _ => token(prec(1, make_keyword("sequencefile"))),
    keyword_orc:             _ => token(prec(1, make_keyword("orc"))),
    keyword_jsonfile:        _ => token(prec(1, make_keyword("jsonfile"))),
    keyword_clustered:       _ => token(prec(1, make_keyword("clustered"))),
    keyword_buckets:         _ => token(prec(1, make_keyword("buckets"))),
    keyword_msck:            _ => token(prec(1, make_keyword("msck"))),
    keyword_repair:          _ => token(prec(1, make_keyword("repair"))),
    keyword_sync:            _ => token(prec(1, make_keyword("sync"))),
    keyword_partitions:      _ => token(prec(1, make_keyword("partitions"))),
    keyword_cluster:         _ => token(prec(1, make_keyword("cluster"))),
    keyword_distribute:      _ => token(prec(1, make_keyword("distribute"))),
    keyword_bucket:          _ => token(prec(1, make_keyword("bucket"))),
    keyword_load:            _ => token(prec(1, make_keyword("load"))),
    keyword_inpath:          _ => token(prec(1, make_keyword("inpath"))),
    keyword_directory:       _ => token(prec(1, make_keyword("directory"))),
    keyword_oids:            _ => token(prec(1, make_keyword("oids"))),
    keyword_virtual:         _ => token(prec(1, make_keyword("virtual"))),
    keyword_jar:             _ => token(prec(1, make_keyword("jar"))),
    // TINYINT column type (Hive/Spark; not ANSI, so absent from base)
    keyword_tinyint:         _ => token(prec(1, make_keyword("tinyint"))),
    // Hive 4 data connectors
    keyword_connector:       _ => token(prec(1, make_keyword("connector"))),
    keyword_connectors:      _ => token(prec(1, make_keyword("connectors"))),
    keyword_dcproperties:    _ => token(prec(1, make_keyword("dcproperties"))),
    keyword_url:             _ => token(prec(1, make_keyword("url"))),
    // SHOW family + transaction administration
    keyword_columns:         _ => token(prec(1, make_keyword("columns"))),
    keyword_indexes:         _ => token(prec(1, make_keyword("indexes"))),
    keyword_locks:           _ => token(prec(1, make_keyword("locks"))),
    keyword_compactions:     _ => token(prec(1, make_keyword("compactions"))),
    keyword_conf:            _ => token(prec(1, make_keyword("conf"))),
    keyword_views:           _ => token(prec(1, make_keyword("views"))),
    keyword_abort:           _ => token(prec(1, make_keyword("abort"))),
    keyword_transactions:    _ => token(prec(1, make_keyword("transactions"))),
    keyword_handler:         _ => token(prec(1, make_keyword("handler"))),
    keyword_environment:     _ => token(prec(1, make_keyword("environment"))),
    keyword_parameter:       _ => token(prec(1, make_keyword("parameter"))),
    keyword_style:           _ => token(prec(1, make_keyword("style"))),
    keyword_overwrite:       _ => token(prec(1, make_keyword("overwrite"))),
    keyword_transform:       _ => token(prec(1, make_keyword("transform"))),
    keyword_show:            _ => token(prec(1, make_keyword("show"))),
    keyword_describe:        _ => token(prec(1, make_keyword("describe"))),
    keyword_formatted:       _ => token(prec(1, make_keyword("formatted"))),
    keyword_extended:        _ => token(prec(1, make_keyword("extended"))),
    keyword_databases:       _ => token(prec(1, make_keyword("databases"))),
    keyword_schemas:         _ => token(prec(1, make_keyword("schemas"))),
    keyword_functions:       _ => token(prec(1, make_keyword("functions"))),
    keyword_exchange:        _ => token(prec(1, make_keyword("exchange"))),
    keyword_concatenate:     _ => token(prec(1, make_keyword("concatenate"))),
    // Shares a prefix with keyword_compactions, which is also token(prec(1,…));
    // at equal precedence longest-match still resolves COMPACTIONS correctly.
    keyword_compact:         _ => token(prec(1, make_keyword("compact"))),
    keyword_pool:            _ => token(prec(1, make_keyword("pool"))),

    ...hive_storage_rules,
    ...hive_partition_rules,
    ...hive_lateral_view_rules,

  },
}));
