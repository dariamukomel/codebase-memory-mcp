import { paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE [OR REPLACE] NAMESPACE [IF NOT EXISTS] name [COMMENT str] [LOCATION path]
  create_namespace: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_namespace,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_location, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] STREAMING TABLE [IF NOT EXISTS] name
  //   [CLUSTER BY (col [, ...])] [COMMENT 'str'] [TBLPROPERTIES (...)] [AS query]
  create_streaming_table: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_streaming,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    optional(seq($.keyword_cluster, $.keyword_by, paren_list($.identifier, true))),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_tblproperties, paren_list($.table_option, true))),
    optional(seq($.keyword_as, $.create_query)),
  ),

  // CREATE [OR REPLACE] MATERIALIZED VIEW [IF NOT EXISTS] name [(cols)]
  //   [COMMENT 'str'] [CLUSTER BY (cols)] [TBLPROPERTIES (…)]
  //   [SCHEDULE [REFRESH] {CRON 'expr' [AT TIME ZONE 'tz'] | EVERY n unit}]
  //   AS query
  create_materialized_view: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_cluster, $.keyword_by, paren_list($.identifier, true))),
    optional(seq($.keyword_tblproperties, paren_list($.table_option, true))),
    optional($.schedule_clause),
    $.keyword_as,
    $.create_query,
  )),

  schedule_clause: $ => seq(
    $.keyword_schedule,
    optional($.keyword_refresh),
    choice(
      seq(
        $.keyword_cron,
        alias($._literal_string, $.literal),
        optional(seq($.keyword_at, $.keyword_time, $.keyword_zone, alias($._literal_string, $.literal))),
      ),
      seq($.keyword_every, alias($._integer, $.literal), $.identifier),
    ),
  ),

  // CREATE [OR REPLACE] LIVE TABLE [IF NOT EXISTS] name [settings] [AS query]
  create_live_table: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_live,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_tblproperties, paren_list($.table_option, true))),
    optional(seq($.keyword_as, $.create_query)),
  ),
  // CREATE TABLE … LIKE … moved to spark/grammar/create.js (OSS Spark syntax).

  // Iceberg partition transform: year(ts), month(ts), day(ts), hour(ts),
  //   bucket(16, id), truncate(10, name), identity(col)
  partition_field: $ => choice(
    seq(
      field('transform', $.identifier),
      '(',
      optional(seq(field('size', $.literal), ',')),
      field('column', $.identifier),
      ')',
    ),
    field('column', $.identifier),
  ),

  // CREATE [OR REPLACE] CATALOG [IF NOT EXISTS] name [COMMENT 'str']
  create_catalog: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_catalog,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] VOLUME [IF NOT EXISTS] catalog.schema.name [LOCATION 'path']
  create_volume: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_volume,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_location, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] CONNECTION [IF NOT EXISTS] name TYPE type [OPTIONS (k = v [, ...])]
  create_connection: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_connection,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_type,
    $.identifier,
    optional(seq($.keyword_options, paren_list($.table_option, true))),
  ),

  // CREATE [OR REPLACE] CREDENTIAL [IF NOT EXISTS] name [COMMENT 'str']
  create_credential: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_credential,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] EXTERNAL LOCATION [IF NOT EXISTS] name [URL 'url'] [COMMENT 'str']
  create_external_location: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_external,
    $.keyword_location,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_url, alias($._literal_string, $.literal))),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] SHARE [IF NOT EXISTS] name [COMMENT 'str']
  create_share: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_share,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] RECIPIENT [IF NOT EXISTS] name [COMMENT 'str']
  create_recipient: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_recipient,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] PROVIDER [IF NOT EXISTS] name [COMMENT 'str']
  create_provider: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_provider,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  // CREATE [OR REPLACE] POLICY [IF NOT EXISTS] name [COMMENT 'str']
  create_policy: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_policy,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),


  // UNDROP { MATERIALIZED VIEW | TABLE } { name | WITH ID id }
  // https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-undrop-table
  undrop_statement: $ => seq(
    $.keyword_undrop,
    choice(seq($.keyword_materialized, $.keyword_view), $.keyword_table),
    choice(
      field('name', $.object_reference),
      seq($.keyword_with, $.keyword_id, alias($._literal_string, $.literal)),
    ),
  ),

  // CREATE SERVER (Lakehouse Federation); options modelled as the generic
  // OPTIONS (k = v, …) form Databricks uses for federated objects.
  create_server: $ => seq(
    $.keyword_create,
    $.keyword_server,
    optional($._if_not_exists),
    field('name', $.identifier),
    optional(seq($.keyword_type, alias($._literal_string, $.literal))),
    optional(seq($.keyword_options, paren_list($._key_value_pair, true))),
  ),

  // DROP BLOOMFILTER INDEX ON [TABLE] table_name
  drop_bloomfilter_index: $ => seq(
    $.keyword_drop,
    $.keyword_bloomfilter,
    $.keyword_index,
    $.keyword_on,
    optional($.keyword_table),
    field('table', $.object_reference),
  ),

};
