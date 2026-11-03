import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // ALTER SESSION SET p = v [, …] | UNSET p [, …]
  // https://docs.snowflake.com/en/sql-reference/sql/alter-session
  // Previously accepted exactly one SET pair and no UNSET form at all.
  alter_session: $ => seq(
    $.keyword_alter,
    $.keyword_session,
    choice(
      seq($.keyword_set, $.session_parameter, repeat(seq(optional(','), $.session_parameter))),
      seq($.keyword_unset, comma_list($.identifier, true)),
    ),
  ),

  session_parameter: $ => seq(
    field('name', $.identifier),
    '=',
    field('value', $._expression),
  ),

  // ALTER WAREHOUSE [IF EXISTS] name SET|SUSPEND|RESUME|ABORT ALL QUERIES
  alter_warehouse_statement: $ => seq(
    $.keyword_alter,
    $.keyword_warehouse,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_set, $.warehouse_properties),
      $.keyword_suspend,
      seq($.keyword_resume, optional(seq($.keyword_if, $.keyword_suspend))),
      seq($.keyword_abort, $.keyword_all, $.keyword_queries),
    ),
  ),

  // ALTER TABLE [IF EXISTS] name CLUSTER BY (exprs) | DROP CLUSTERING KEY
  alter_table_cluster: $ => seq(
    $.keyword_alter,
    $.keyword_table,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_cluster, $.keyword_by, paren_list($._expression, true)),
      seq($.keyword_drop, $.keyword_clustering, $.keyword_key),
    ),
  ),

};
