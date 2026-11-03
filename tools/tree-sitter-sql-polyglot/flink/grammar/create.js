import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // [WITH] ('key' = 'val', ...); Flink connector options
  // keyword_with is optional so ALTER SET can use bare parens
  with_properties: $ => seq(
    optional($.keyword_with),
    '(',
    comma_list(
      seq(
        field('key', alias($._literal_string, $.literal)),
        '=',
        field('value', alias($._literal_string, $.literal)),
      ),
      true,
    ),
    ')',
  ),

  _flink_comment: $ => seq(
    $.keyword_comment,
    alias($._literal_string, $.literal),
  ),

  // DISTRIBUTED [BY [HASH|RANGE] (cols)] [INTO n BUCKETS]
  distribution_spec: $ => prec.left(seq(
    $.keyword_distributed,
    optional(
      seq(
        $.keyword_by,
        optional(choice($.keyword_hash, $.keyword_range)),
        paren_list($.identifier, true),
      ),
    ),
    optional(
      seq(
        $.keyword_into,
        field('buckets', alias($._natural_number, $.literal)),
        $.keyword_buckets,
      ),
    ),
  )),

  // WATERMARK FOR event_time_col AS watermark_expr
  watermark_definition: $ => seq(
    $.keyword_watermark,
    $.keyword_for,
    field('event_time_col', $.identifier),
    $.keyword_as,
    field('strategy', $._expression),
  ),

  // col type METADATA [FROM 'alias'] [VIRTUAL] [COMMENT '...']
  metadata_column: $ => prec.left(seq(
    field('name', $.identifier),
    field('type', $._type),
    $.keyword_metadata,
    optional(seq($.keyword_from, field('metadata_key', alias($._literal_string, $.literal)))),
    optional($.keyword_virtual),
    optional($._flink_comment),
  )),

  // col AS expr [COMMENT '...']  (computed column in CREATE TABLE)
  computed_column: $ => prec.left(seq(
    field('name', $.identifier),
    $.keyword_as,
    field('expression', $._expression),
    optional($._flink_comment),
  )),

  // [CONSTRAINT name] PRIMARY KEY (cols) [NOT ENFORCED]
  constraint: $ => seq(
    optional(seq($.keyword_constraint, field('constraint_name', $.identifier))),
    choice(
      seq($.keyword_primary, $.keyword_key),
      $.keyword_unique,
    ),
    paren_list($.identifier, true),
    optional(seq(optional($.keyword_not), $.keyword_enforced)),
  ),

  // Column list supporting metadata/computed/watermark/constraint entries
  column_definitions: $ => seq(
    '(',
    comma_list(
      choice(
        $.metadata_column,
        $.computed_column,
        $.watermark_definition,
        $.constraint,
        $.column_definition,
      ),
      true,
    ),
    ')',
  ),

  // LIKE src [(INCLUDING|EXCLUDING|OVERWRITING) option, ...]
  like_clause: $ => prec.left(seq(
    $.keyword_like,
    $.object_reference,
    optional(
      seq(
        '(',
        comma_list(
          seq(
            choice($.keyword_including, $.keyword_excluding, $.keyword_overwriting),
            choice(
              $.keyword_all,
              $.keyword_generated,
              $.keyword_metadata,
              $.keyword_constraints,
              $.keyword_partitions,
              $.keyword_options,
              $.keyword_watermarks,
              $.keyword_distribution,
            ),
          ),
          true,
        ),
        ')',
      ),
    ),
  )),

  // Override: {CREATE [OR REPLACE] | REPLACE} [TEMPORARY] TABLE [IF NOT EXISTS] name
  //   [(cols)] [COMMENT] [DISTRIBUTED] [PARTITIONED BY] [USING CONNECTION] [WITH] [LIKE] [AS select]
  create_table: $ => prec.left(
    seq(
      // Flink also accepts a bare REPLACE TABLE … AS select (RTAS).
      choice(
        seq($.keyword_create, optional($._or_replace)),
        $.keyword_replace,
      ),
      optional($._temporary),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional($.column_definitions),
      optional($._flink_comment),
      optional($.distribution_spec),
      optional(seq(
        $.keyword_partitioned,
        $.keyword_by,
        paren_list($.identifier, true),
      )),
      optional(seq($.keyword_using, $.keyword_connection, $.object_reference)),
      optional($.with_properties),
      optional($.like_clause),
      optional(seq($.keyword_as, $.create_query)),
    ),
  ),

  // CREATE CATALOG [IF NOT EXISTS] name [COMMENT '...'] [WITH (...)]
  create_catalog: $ => seq(
    $.keyword_create,
    $.keyword_catalog,
    optional($._if_not_exists),
    field('name', $.identifier),
    optional($._flink_comment),
    optional($.with_properties),
  ),

  // Override: CREATE DATABASE [IF NOT EXISTS] name [COMMENT '...'] [WITH (...)]
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    $.object_reference,
    optional($._flink_comment),
    optional($.with_properties),
  )),

  // Override: CREATE [OR REPLACE] [TEMPORARY] [SYSTEM] FUNCTION [IF NOT EXISTS] name
  //   AS 'class' [LANGUAGE ...] [USING (JAR|ARTIFACT) '...', ...] [WITH (...)]
  create_function: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_function,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_as,
    field('class_name', alias($._literal_string, $.literal)),
    optional(
      seq(
        $.keyword_language,
        field('language', choice(
          $.keyword_java,
          $.keyword_scala,
          $.keyword_python,
          $.keyword_sql,
        )),
      ),
    ),
    optional(
      seq(
        $.keyword_using,
        comma_list(
          seq(
            choice($.keyword_jar, $.keyword_artifact),
            field('resource', alias($._literal_string, $.literal)),
          ),
          true,
        ),
      ),
    ),
    optional($.with_properties),
  )),

  // Override: CREATE [OR REPLACE] [TEMPORARY] VIEW [IF NOT EXISTS] name [(fields)] [COMMENT] AS select
  create_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace),
      optional($._temporary),
      $.keyword_view,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional(paren_list($.identifier)),
      optional($._flink_comment),
      $.keyword_as,
      $.create_query,
    ),
  ),

  // CREATE [TEMPORARY] MODEL [IF NOT EXISTS] name [INPUT (...)] [OUTPUT (...)] [COMMENT] [WITH] [AS select]
  create_model: $ => prec.left(seq(
    $.keyword_create,
    optional($._temporary),
    $.keyword_model,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_input, paren_list($.column_definition, true))),
    optional(seq($.keyword_output, paren_list($.column_definition, true))),
    optional($._flink_comment),
    optional($.with_properties),
    optional(seq($.keyword_as, $.create_query)),
  )),

  // CREATE [OR ALTER] MATERIALIZED TABLE name [(cols)] [COMMENT] [DISTRIBUTED] [PARTITIONED BY]
  //   [WITH] [FRESHNESS = INTERVAL] [REFRESH_MODE = FULL|CONTINUOUS] AS select
  create_materialized_table: $ => prec.left(seq(
    $.keyword_create,
    optional(seq($.keyword_or, $.keyword_alter)),
    $.keyword_materialized,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    optional($._flink_comment),
    optional($.distribution_spec),
    optional(seq(
      $.keyword_partitioned,
      $.keyword_by,
      paren_list($.identifier, true),
    )),
    optional($.with_properties),
    optional(seq(
      $.keyword_freshness,
      '=',
      $.interval,
    )),
    optional(seq(
      $.keyword_refresh_mode,
      '=',
      choice($.keyword_full, $.keyword_continuous),
    )),
    $.keyword_as,
    $.create_query,
  )),

  // CREATE [OR REPLACE] [TEMPORARY] [SYSTEM] CONNECTION [IF NOT EXISTS] name [COMMENT] WITH (...)
  create_connection: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_connection,
    optional($._if_not_exists),
    $.object_reference,
    optional($._flink_comment),
    $.with_properties,
  ),

};
