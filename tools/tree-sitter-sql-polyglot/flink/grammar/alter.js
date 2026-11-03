import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // ALTER TABLE [IF EXISTS] name action
  alter_table: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_table,
    optional($._if_exists),
    field("target", $.object_reference),
    choice(
      seq($.keyword_rename, $.keyword_to, $.object_reference),
      seq($.keyword_rename, $.identifier, $.keyword_to, $.identifier),
      seq($.keyword_set, $.with_properties),
      seq($.keyword_reset, '(', comma_list(alias($._literal_string, $.literal), true), ')'),
      seq($.keyword_add, optional($._if_not_exists), $.keyword_partition, paren_list(seq($.identifier, '=', $.literal), true), optional(seq($.keyword_with, $.with_properties))),
      seq($.keyword_drop, $.keyword_partition, paren_list(seq($.identifier, '=', $.literal), true)),
      seq($.keyword_add, $.watermark_definition),
      seq($.keyword_drop, $.keyword_watermark),
      seq($.keyword_add, $.distribution_spec),
      seq($.keyword_modify, $.distribution_spec),
      seq($.keyword_drop, $.keyword_distribution),
      seq($.keyword_add, optional($._if_not_exists), $.column_definition, optional($.column_position)),
      seq($.keyword_add, optional($._if_not_exists), $.metadata_column),
      seq($.keyword_modify, $.column_definition),
      seq($.keyword_drop, $.keyword_primary, $.keyword_key),
      seq($.keyword_drop, $.keyword_constraint, $.identifier),
      seq($.keyword_drop, optional($.keyword_column), optional($._if_exists), $.identifier),
      seq($.keyword_drop, '(', comma_list($.identifier, true), ')'),
    ),
  )),

  // ALTER CATALOG name (SET | RESET | COMMENT)
  alter_catalog: $ => seq(
    $.keyword_alter,
    $.keyword_catalog,
    field('name', $.identifier),
    choice(
      seq($.keyword_set, $.with_properties),
      seq($.keyword_reset, '(', comma_list(alias($._literal_string, $.literal), true), ')'),
      seq($.keyword_comment, alias($._literal_string, $.literal)),
    ),
  ),

  // ALTER DATABASE [cat.]name SET (...)
  alter_database: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_database,
    $.object_reference,
    $.keyword_set,
    $.with_properties,
  )),

  // ALTER VIEW name (RENAME TO | AS select)
  alter_view: $ => seq(
    $.keyword_alter,
    $.keyword_view,
    $.object_reference,
    choice(
      seq($.keyword_rename, $.keyword_to, $.object_reference),
      seq($.keyword_as, $._dml_read),
    ),
  ),

  // ALTER [TEMPORARY] [SYSTEM] FUNCTION [IF EXISTS] name AS 'class' [LANGUAGE ...]
  alter_function: $ => prec.left(seq(
    $.keyword_alter,
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_function,
    optional($._if_exists),
    $.object_reference,
    $.keyword_as,
    field('class_name', alias($._literal_string, $.literal)),
    optional(
      seq(
        $.keyword_language,
        choice($.keyword_java, $.keyword_scala, $.keyword_python, $.keyword_sql),
      ),
    ),
  )),

  // ALTER MODEL [IF EXISTS] name (SET | RESET | RENAME TO)
  alter_model: $ => seq(
    $.keyword_alter,
    $.keyword_model,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_set, $.with_properties),
      seq($.keyword_reset, '(', comma_list(alias($._literal_string, $.literal), true), ')'),
      seq($.keyword_rename, $.keyword_to, $.object_reference),
    ),
  ),

  // ALTER MATERIALIZED TABLE name action
  alter_materialized_table: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_table,
    $.object_reference,
    choice(
      $.keyword_suspend,
      seq($.keyword_resume, optional($.with_properties)),
      seq($.keyword_refresh, optional(seq($.keyword_partition, paren_list(seq($.identifier, '=', $.literal), true)))),
      seq($.keyword_set, $.keyword_freshness, '=', $.interval),
      seq($.keyword_set, $.keyword_refresh_mode, '=', choice($.keyword_full, $.keyword_continuous)),
      seq($.keyword_set, $.with_properties),
      seq($.keyword_reset, '(', comma_list(alias($._literal_string, $.literal), true), ')'),
      seq($.keyword_as, $.create_query),
    ),
  )),

  // ALTER [TEMPORARY] [SYSTEM] CONNECTION [IF EXISTS] name (SET | RESET | RENAME TO)
  alter_connection: $ => seq(
    $.keyword_alter,
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_connection,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_set, $.with_properties),
      seq($.keyword_reset, '(', comma_list(alias($._literal_string, $.literal), true), ')'),
      seq($.keyword_rename, $.keyword_to, $.object_reference),
    ),
  ),

};
