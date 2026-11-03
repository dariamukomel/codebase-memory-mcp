export default {

  // DROP [TEMPORARY] [SYSTEM] FUNCTION [IF EXISTS] name
  drop_function: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_function,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP [TEMPORARY] TABLE [IF EXISTS] name
  drop_table: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    $.keyword_table,
    optional($._if_exists),
    field("target", $.object_reference),
  ),

  // DROP [TEMPORARY] VIEW [IF EXISTS] name
  drop_view: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP DATABASE [IF EXISTS] name [RESTRICT | CASCADE]
  drop_database: $ => seq(
    $.keyword_drop,
    $.keyword_database,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  // DROP CATALOG [IF EXISTS] name
  drop_catalog: $ => seq(
    $.keyword_drop,
    $.keyword_catalog,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  // DROP [TEMPORARY] MODEL [IF EXISTS] name
  drop_model: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    $.keyword_model,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP [TEMPORARY] MATERIALIZED TABLE [IF EXISTS] name
  drop_materialized_table: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    $.keyword_materialized,
    $.keyword_table,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP [TEMPORARY] [SYSTEM] CONNECTION [IF EXISTS] name
  drop_connection: $ => seq(
    $.keyword_drop,
    optional($._temporary),
    optional($.keyword_system),
    $.keyword_connection,
    optional($._if_exists),
    $.object_reference,
  ),

};
