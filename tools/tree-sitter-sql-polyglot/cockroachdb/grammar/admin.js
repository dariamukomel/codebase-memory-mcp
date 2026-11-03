import { comma_list, paren_list } from '../../grammar/helpers.js';

// CockroachDB statements that had no rule at all. Shapes follow the examples
// on each statement's page under https://www.cockroachlabs.com/docs/stable/
export default {

  // { CANCEL | PAUSE | RESUME } { JOB | JOBS } { id | (select) }
  // CANCEL|PAUSE|RESUME ALL <type> JOBS
  // CANCEL|PAUSE|RESUME JOBS FOR SCHEDULES { id | (select) }
  job_control_statement: $ => seq(
    choice($.keyword_cancel, $.keyword_pause, $.keyword_resume),
    choice(
      seq(
        $.keyword_all,
        optional(field('job_type', $.identifier)),
        $.keyword_jobs,
      ),
      seq(
        choice($.keyword_job, $.keyword_jobs),
        choice(
          seq($.keyword_for, $.keyword_schedules, $._job_selector),
          $._job_selector,
        ),
      ),
    ),
  ),

  // CANCEL { QUERY | QUERIES | SESSION | SESSIONS } { id | (select) }
  cancel_query_statement: $ => seq(
    $.keyword_cancel,
    choice(
      $.keyword_query,
      $.keyword_queries,
      $.keyword_session,
      $.keyword_sessions,
    ),
    $._job_selector,
  ),

  // { PAUSE | RESUME | DROP } { SCHEDULE | SCHEDULES } { id | (select) }
  schedule_control_statement: $ => seq(
    choice($.keyword_pause, $.keyword_resume, $.keyword_drop),
    choice($.keyword_schedule, $.keyword_schedules),
    $._job_selector,
  ),

  // A job/session/schedule id, or a parenthesised query producing ids.
  // _expression already covers both; a literal id and a subquery such as
  // `(WITH x AS (SHOW JOBS) SELECT job_id FROM x)`. Offering _dml_read as a
  // second alternative would make `( SELECT … )` reducible two ways, so the
  // documented unparenthesised `PAUSE SCHEDULES WITH … SELECT …` form is not
  // accepted; the parenthesised spelling is.
  _job_selector: $ => field('id', $._expression),

  // SET CLUSTER SETTING name = value
  set_cluster_setting_statement: $ => seq(
    $.keyword_set,
    $.keyword_cluster,
    $.keyword_setting,
    field('name', $.object_reference),
    choice('=', $.keyword_to),
    field('value', $._expression),
  ),

  // RESET CLUSTER SETTING name
  reset_cluster_setting_statement: $ => seq(
    $.keyword_reset,
    $.keyword_cluster,
    $.keyword_setting,
    field('name', $.object_reference),
  ),

  // CREATE EXTERNAL CONNECTION [IF NOT EXISTS] name AS 'uri'
  create_external_connection_statement: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_connection,
    optional($._if_not_exists),
    field('name', $.identifier),
    $.keyword_as,
    field('uri', alias($._literal_string, $.literal)),
  ),

  // DROP EXTERNAL CONNECTION name
  drop_external_connection_statement: $ => seq(
    $.keyword_drop,
    $.keyword_external,
    $.keyword_connection,
    optional($._if_exists),
    field('name', choice($.identifier, alias($._literal_string, $.literal))),
  ),

  // CHECK EXTERNAL CONNECTION 'uri' [WITH option = value [, …]]
  check_external_connection_statement: $ => prec.right(seq(
    $.keyword_check,
    $.keyword_external,
    $.keyword_connection,
    field('uri', alias($._literal_string, $.literal)),
    optional($.crdb_options_clause),
  )),

  // EXPORT INTO <format> 'uri' [WITH option = value [, …]]
  //   FROM { TABLE t | SELECT … }
  export_statement: $ => seq(
    $.keyword_export,
    $.keyword_into,
    field('format', $.identifier),
    field('uri', $._expression),
    optional($.crdb_options_clause),
    $.keyword_from,
    choice(
      seq($.keyword_table, field('table', $.object_reference)),
      $._dml_read,
    ),
  ),

  // CREATE STATISTICS name [ON col [, …]] FROM table
  //   [USING EXTREMES | WHERE …] [AS OF SYSTEM TIME …]
  create_statistics_statement: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_statistics,
    field('name', $.identifier),
    optional(seq($.keyword_on, comma_list($.identifier, true))),
    $.keyword_from,
    field('table', $.object_reference),
    optional(seq($.keyword_using, field('mode', $.identifier))),
    optional($.where),
    optional($.as_of_clause),
  )),

  // DROP OWNED BY role [, …] [CASCADE | RESTRICT]
  drop_owned_by_statement: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_owned,
    $.keyword_by,
    comma_list(field('role', $.identifier), true),
    optional($._drop_behavior),
  )),

};
