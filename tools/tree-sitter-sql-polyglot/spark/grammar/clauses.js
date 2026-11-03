import { comma_list, paren_list } from '../../grammar/helpers.js';

// Clause completions from the Spark SQL syntax reference (79 statement
// pages from spark.apache.org). Each override reproduces the inherited
// body; an override replaces the parent rule wholesale.
export default {

  // DATABASE, SCHEMA and NAMESPACE are interchangeable throughout Spark's
  // database DDL, but the other two spellings are already owned elsewhere:
  // create_schema / alter_schema / drop_schema by the base grammar, and
  // create_namespace by Databricks downstream. Accepting them here as well
  // would be ambiguous, so the schema rules below carry the same options and
  // NAMESPACE is left to Databricks.
  _database_keyword: $ => $.keyword_database,

  // ( name = value [, ...] )
  _dbproperties: $ => seq(
    choice($.keyword_dbproperties, $.keyword_properties),
    paren_list($.spark_property, true),
  ),

  spark_property: $ => seq(
    field('name', choice($.identifier, $.literal)),
    '=',
    field('value', $._expression),
  ),

  // CREATE {DATABASE | SCHEMA} [IF NOT EXISTS] name
  //   [COMMENT c] [LOCATION path] [WITH DBPROPERTIES (...)]
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $._database_keyword,
    optional($._if_not_exists),
    $.identifier,
    repeat(choice(
      seq($.keyword_comment, field('comment', $.literal)),
      seq($.keyword_location, field('location', $.literal)),
      seq($.keyword_with, $._dbproperties),
    )),
  )),

  // ALTER {DATABASE | SCHEMA | NAMESPACE} name
  //   SET {DBPROPERTIES | PROPERTIES} (...)
  alter_database: $ => seq(
    $.keyword_alter,
    $._database_keyword,
    $.identifier,
    choice(
      seq($.keyword_set, $._dbproperties),
      seq($.keyword_set, $.keyword_location, field('location', $.literal)),
      $.rename_object,
      $.change_ownership,
    ),
  ),

  // DROP {DATABASE | NAMESPACE} [IF EXISTS] name [RESTRICT | CASCADE]
  drop_database: $ => prec.left(seq(
    $.keyword_drop,
    $._database_keyword,
    optional($._if_exists),
    $.identifier,
    optional($._drop_behavior),
  )),

  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    choice(
      seq(
        optional($._if_not_exists),
        $.identifier,
        optional(seq($.keyword_authorization, $.identifier)),
        repeat(choice(
          seq($.keyword_comment, field('comment', $.literal)),
          seq($.keyword_location, field('location', $.literal)),
          seq($.keyword_with, $._dbproperties),
        )),
      ),
      seq($.keyword_authorization, $.identifier),
    ),
  )),

  alter_schema: $ => seq(
    $.keyword_alter,
    $.keyword_schema,
    $.identifier,
    choice(
      seq(choice($.keyword_rename, $.keyword_owner), $.keyword_to, $.identifier),
      seq($.keyword_set, $._dbproperties),
      seq($.keyword_set, $.keyword_location, field('location', $.literal)),
    ),
  ),

  drop_schema: $ => prec.left(seq(
    $.keyword_drop,
    $.keyword_schema,
    optional($._if_exists),
    $.identifier,
    optional($._drop_behavior),
  )),

  // DROP TABLE [IF EXISTS] name [PURGE]
  drop_table: $ => seq(
    $.keyword_drop,
    $.keyword_table,
    optional($._if_exists),
    field("target", $.object_reference),
    optional(choice($._drop_behavior, $.keyword_purge)),
  ),

  // DROP [TEMPORARY] FUNCTION [IF EXISTS] name
  drop_function: $ => seq(
    $.keyword_drop,
    optional($.keyword_temporary),
    $.keyword_function,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

};
