import { paren_list, comma_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // CREATE [OR REPLACE] MASKING POLICY [IF NOT EXISTS] name
  //   AS (param TYPE [, ...]) RETURNS return_type -> body_expr
  create_masking_policy: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_masking,
    $.keyword_policy,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_as,
    paren_list($.policy_param, true),
    $.keyword_returns,
    $._type,
    '->',
    $._expression,
    repeat(choice($._comment_property, $.snowflake_property)),
  ),

  // CREATE [OR REPLACE] ROW ACCESS POLICY [IF NOT EXISTS] name
  //   AS (param TYPE [, ...]) RETURNS BOOLEAN -> body_expr
  create_row_access_policy: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_row,
    $.keyword_access,
    $.keyword_policy,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_as,
    paren_list($.policy_param, true),
    $.keyword_returns,
    $.keyword_boolean,
    '->',
    $._expression,
    optional(seq($.keyword_comment, '=', alias($._literal_string, $.literal))),
  ),

  // param_name TYPE  (used in MASKING POLICY / ROW ACCESS POLICY signatures)
  policy_param: $ => seq($.identifier, $._type),

  // CREATE [OR REPLACE] FILE FORMAT [IF NOT EXISTS] name [TYPE = id] [prop = value ...]
  create_file_format_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_file,
    $.keyword_format,
    optional($._if_not_exists),
    $.object_reference,
    repeat($.file_format_property),
  ),

  // identifier = (literal | identifier | number | (list))
  file_format_property: $ => seq(
    $.identifier,
    '=',
    choice(
      $.literal,
      $.identifier,
      seq('(', repeat(seq(
        choice($.literal, $.identifier),
        optional(','),
      )), ')'),
    ),
  ),

  // FROM BACKUP SET <backup_set> IDENTIFIER '<backup_id>'
  backup_set_clause: $ => seq(
    $.keyword_from, $.keyword_backup, $.keyword_set, $.object_reference,
    $.keyword_identifier, alias($._literal_string, $.literal),
  ),

  // CLONE source_object [AT / BEFORE time_travel]
  clone_clause: $ => prec.right(seq(
    $.keyword_clone,
    $.object_reference,
    optional($.time_travel_clause),
    repeat(choice(
      seq($.keyword_ignore, $.keyword_tables, $.keyword_with, $.keyword_insufficient, $.keyword_data, $.keyword_retention),
      seq($.keyword_ignore, $.keyword_hybrid, $.keyword_tables),
      seq($.keyword_include, $.keyword_internal, $.keyword_stages),
    )),
  )),

  // CREATE [OR REPLACE] WAREHOUSE [IF NOT EXISTS] name [properties]
  create_warehouse_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_warehouse,
    optional($._if_not_exists),
    $.object_reference,
    optional($.warehouse_properties),
  ),

  // Each property may be introduced by the optional WITH (CREATE WAREHOUSE wh WITH WAREHOUSE_SIZE = ...).
  warehouse_properties: $ => repeat1(
    choice(
      seq(
        optional($.keyword_with),
        choice(
          seq($.keyword_warehouse_size, '=', choice($.identifier, alias($._literal_string, $.literal))),
          seq($.keyword_max_cluster_count, '=', $._expression),
          seq($.keyword_min_cluster_count, '=', $._expression),
          seq($.keyword_scaling_policy, '=', choice($.keyword_standard, $.keyword_economy)),
          seq($.keyword_auto_suspend, '=', $._expression),
          seq($.keyword_auto_resume, '=', choice($.keyword_true, $.keyword_false)),
          seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
          // Fallback for the properties the reference adds between releases.
          $.snowflake_property,
        ),
      ),
      $.tag_clause,
    ),
  ),

  // CREATE [OR REPLACE] EXTERNAL TABLE [IF NOT EXISTS] name [(columns)] [USING TEMPLATE (query)]
  //   [INTEGRATION = '...'] [WITH] LOCATION = @stage [FILE_FORMAT = (props)] [PATTERN = 'regex']
  //   [PARTITION BY (cols)] [COPY GRANTS] [COMMENT = '...'] [ROW ACCESS POLICY ...] [TAG (...)]
  //   plus the plain NAME = value properties (AUTO_REFRESH, PARTITION_TYPE, TABLE_FORMAT, AWS_SNS_TOPIC, ...)
  create_external_table: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_external,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional(paren_list($.external_table_column, true)),
    repeat(
      choice(
        seq($.keyword_using, $.keyword_template, wrapped_in_parenthesis($.create_query)),
        seq($.keyword_integration, '=', alias($._literal_string, $.literal)),
        seq(optional($.keyword_with), $.keyword_location, '=', $.stage_ref),
        seq(
          $.keyword_file_format,
          '=',
          seq('(', repeat1($.file_format_property), ')'),
        ),
        seq($.keyword_pattern, '=', alias($._literal_string, $.literal)),
        seq($.keyword_partition, $.keyword_by, paren_list($.identifier, true)),
        seq($.keyword_copy, $.keyword_grants),
        seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
        $.row_access_policy_clause,
        $.tag_clause,
        $.snowflake_property,
      ),
    ),
  )),

  // col TYPE [AS (expr)]; external table virtual column projection
  external_table_column: $ => seq(
    field('name', $.identifier),
    field('type', $._type),
    optional(seq($.keyword_as, $._expression)),
  ),

};
