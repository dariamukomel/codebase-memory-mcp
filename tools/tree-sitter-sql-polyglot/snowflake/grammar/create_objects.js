import { comma_list, paren_list } from '../../grammar/helpers.js';

// CREATE statements for Snowflake account and schema objects. Each object has its own rule with the
// clauses its CREATE page documents; option lists (NAME = value) stay open-ended through
// snowflake_property. Every object that supports it also accepts CLONE.
// https://docs.snowflake.com/en/sql-reference/sql/create-stream (and the sibling pages)
const head = ($, ...kind) => seq(
  $.keyword_create,
  optional($._or_replace_or_alter),
  ...kind,
  optional($._if_not_exists),
  $.object_reference,
);

export default {

  _clone_with_grants: $ => seq($.clone_clause, optional(seq($.keyword_copy, $.keyword_grants))),

  _comment_property: $ => seq(optional($.keyword_with), $.keyword_comment, '=', alias($._literal_string, $.literal)),

  // CREATE STREAM name [COPY GRANTS] [WITH TAG ...] ON { TABLE | EXTERNAL TABLE | DYNAMIC TABLE | EVENT TABLE | VIEW | STAGE } src
  //   [AT | BEFORE (...)] [APPEND_ONLY = ...] ...
  create_stream: $ => seq(
    head($, $.keyword_stream),
    choice(
      $._clone_with_grants,
      seq(
        repeat(choice(seq($.keyword_copy, $.keyword_grants), $.tag_clause)),
        $.keyword_on,
        choice(
          $.keyword_table,
          seq($.keyword_external, $.keyword_table),
          seq($.keyword_dynamic, $.keyword_table),
          seq($.keyword_event, $.keyword_table),
          $.keyword_view,
          $.keyword_stage,
        ),
        $.object_reference,
        optional($.time_travel_clause),
        repeat(choice($._comment_property, $.snowflake_property)),
      ),
    ),
  ),

  // CREATE TASK name [WITH TAG ..] [WITH CONTACT ..] [<property> ...] [AFTER t [, ...]] [WHEN <cond>] AS <statement>
  create_task: $ => seq(
    head($, $.keyword_task),
    choice(
      $._clone_with_grants,
      seq(
        repeat(choice(
          $.tag_clause,
          $.contact_clause,
          seq($.keyword_after, comma_list($.object_reference, true)),
          seq($.keyword_when, $._expression),
          seq($.keyword_execute, $.keyword_as, $.keyword_user, $.identifier),
          $._comment_property,
          $.snowflake_property,
        )),
        $.keyword_as,
        $.task_body,
      ),
    ),
  ),

  task_body: $ => choice($.call_statement, $._dml_read, $._insert_statement, $._update_statement, $._delete_statement, $._merge_statement, $.compound_statement),

  // CREATE [TRANSIENT] DYNAMIC [ICEBERG] TABLE name [(columns)] <property> ... [CLUSTER BY (...)] AS query
  create_dynamic_table: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($.keyword_transient),
    $.keyword_dynamic,
    optional($.keyword_iceberg),
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    repeat(choice(
      $._clone_with_grants,
      $.backup_set_clause,
      $.cluster_by_clause,
      $.tag_clause,
      $.row_access_policy_clause,
      $.aggregation_policy_clause,
      $.contact_clause,
      seq($.keyword_require, $.keyword_user),
      seq($.keyword_frozen, $.keyword_where, '(', $._expression, ')'),
      seq($.keyword_backfill, $.keyword_from, $.object_reference, optional(seq($.keyword_start, $.keyword_at, '(', $.time_travel_spec, ')'))),
      seq($.keyword_refresh, $.keyword_using, '(', $._dml_write, ')'),
      $._comment_property,
      $.snowflake_property,
    )),
    optional(seq($.keyword_as, $.create_query)),
  ),

  // CREATE [SECURE] [INTERACTIVE] MATERIALIZED VIEW name [COPY GRANTS] [(columns)] <clause> ... AS query
  create_materialized_view: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($.keyword_secure),
    optional($.keyword_interactive),
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_not_exists),
    $.object_reference,
    repeat(choice(
      seq($.keyword_copy, $.keyword_grants),
      paren_list($.view_column, true),
      $.cluster_by_clause,
      $.tag_clause,
      $.row_access_policy_clause,
      $.aggregation_policy_clause,
      $.contact_clause,
      $._comment_property,
      $.snowflake_property,
    )),
    $.keyword_as,
    $.create_query,
  ),

  // CREATE ALERT name [<property> ...] IF ( EXISTS ( <query> ) ) THEN <action>
  create_alert: $ => seq(
    head($, $.keyword_alert),
    choice(
      $._clone_with_grants,
      // FROM TEMPLATE name <property> ...   (no IF / THEN: the template supplies the condition and action)
      seq($.keyword_from, $.keyword_template, $.object_reference, repeat(choice($.tag_clause, $._comment_property, $.snowflake_property))),
      seq(
        repeat(choice($.tag_clause, $._comment_property, $.snowflake_property)),
        $.keyword_if, '(', $.keyword_exists, '(', $._dml_read, ')', ')',
        $.keyword_then,
        $.task_body,
      ),
    ),
  ),

  // CREATE PIPE name [<property> ...] AS COPY INTO ...
  create_pipe: $ => seq(
    head($, $.keyword_pipe),
    repeat(choice($.tag_clause, $._comment_property, $.snowflake_property)),
    $.keyword_as,
    $.copy_into,
  ),

  create_user: $ => seq(
    head($, $.keyword_user),
    repeat(choice($.tag_clause, $._comment_property, $.snowflake_property)),
  ),

  create_network_policy: $ => seq(
    head($, $.keyword_network, $.keyword_policy),
    repeat(choice($._comment_property, $.snowflake_property)),
  ),

  create_network_rule: $ => seq(
    head($, $.keyword_network, $.keyword_rule),
    repeat(choice($._comment_property, $.snowflake_property)),
  ),

  create_share: $ => seq(
    head($, $.keyword_share),
    repeat(choice($._comment_property, $.snowflake_property)),
  ),

  create_database_role: $ => seq(
    head($, $.keyword_database, $.keyword_role),
    repeat(choice($._clone_with_grants, $._comment_property, $.tag_clause)),
  ),

  // CREATE SEQUENCE name [START [WITH] [=] n] [INCREMENT [BY] [=] n] [ORDER | NOORDER] [COMMENT = '...']
  create_sequence: $ => seq(
    head($, $.keyword_sequence),
    repeat(choice(
      $._clone_with_grants,
      seq(optional($.keyword_with), $.keyword_start, optional($.keyword_with), optional('='), alias($._integer, $.literal)),
      seq($.keyword_increment, optional($.keyword_by), optional('='), alias($._integer, $.literal)),
      $.keyword_order,
      $.keyword_noorder,
      $.tag_clause,
      $._comment_property,
    )),
  ),

  create_event_table: $ => seq(
    head($, $.keyword_event, $.keyword_table),
    repeat(choice(
      $._clone_with_grants,
      $.cluster_by_clause,
      $.tag_clause,
      $.row_access_policy_clause,
      $._comment_property,
      $.snowflake_property,
    )),
  ),

  create_file_format_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional(choice($._temporary, $.keyword_volatile)),
    $.keyword_file,
    $.keyword_format,
    optional($._if_not_exists),
    $.object_reference,
    choice(
      $.clone_clause,
      repeat($.file_format_property),
    ),
  ),

  create_stage: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($._temporary),
    $.keyword_stage,
    optional($._if_not_exists),
    $.object_reference,
    choice(
      $.clone_clause,
      repeat(choice(
        $.tag_clause,
        $._comment_property,
        $.snowflake_property,
      )),
    ),
  ),

  // Account-level objects whose CREATE page is a name followed by open-ended properties.
  create_account_object: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    choice(
      seq($.keyword_resource, $.keyword_monitor),
      seq($.keyword_password, $.keyword_policy),
      seq($.keyword_session, $.keyword_policy),
      seq($.keyword_authentication, $.keyword_policy),
      seq($.keyword_external, $.keyword_volume),
      $.keyword_streamlit,
      seq($.keyword_compute, $.keyword_pool),
      seq($.keyword_dcm, $.keyword_project),
      seq($.keyword_dbt, $.keyword_project),
      seq($.keyword_cortex, $.keyword_search, $.keyword_service),
      seq($.keyword_mcp, $.keyword_server),
    ),
    optional($._if_not_exists),
    $.object_reference,
    repeat(choice(
      prec.right(seq($.keyword_triggers, repeat1(seq(
        $.keyword_on, alias($._natural_number, $.literal), $.keyword_percent, $.keyword_do,
        choice($.keyword_notify, $.keyword_suspend, $.keyword_suspend_immediate),
      )))),
      $._platform_clause,
    )),
  ),

};
