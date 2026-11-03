import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // EXECUTE IMMEDIATE { 'sql' | :var | var | expression, e.g. v || ',(80)' } [USING (v, ...)]
  // EXECUTE IMMEDIATE FROM { @stage/file | 'path' } [USING (k => v, ...)] [DRY_RUN = { TRUE | FALSE }]
  execute_immediate_statement: $ => seq(
    $.keyword_execute,
    $.keyword_immediate,
    choice(
      seq(
        $.keyword_from,
        choice($.stage_ref, alias($._literal_string, $.literal)),
        optional(seq($.keyword_using, paren_list($.named_argument, true))),
        optional(seq($.keyword_dry_run, '=', choice($.keyword_true, $.keyword_false))),
      ),
      seq(
        $._expression,
        optional(seq($.keyword_using, paren_list($._expression, true))),
      ),
    ),
  ),

  // EXECUTE DBT PROJECT [IF EXISTS] name | FROM WORKSPACE w  [<property> ...]
  execute_dbt_project: $ => seq(
    $.keyword_execute, $.keyword_dbt, $.keyword_project,
    optional($._if_exists),
    choice($.object_reference, seq($.keyword_from, $.keyword_workspace, $.object_reference)),
    repeat($.snowflake_property),
  ),

  // EXECUTE TASK name [RETRY LAST | RETRY GRAPH RUN GROUP '<id>' | USING CONFIG = '<json>']
  execute_task: $ => seq(
    $.keyword_execute,
    $.keyword_task,
    $.object_reference,
    optional(choice(
      seq($.keyword_retry, $.keyword_last),
      seq($.keyword_retry, $.keyword_graph, $.keyword_run, $.keyword_group, alias($._literal_string, $.literal)),
      seq($.keyword_using, $.keyword_config, '=', alias($._literal_string, $.literal)),
    )),
  ),

  // CALL name([name =>] arg, ...) [INTO :var]
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    choice(
      paren_list(choice($.named_argument, $._expression), false),
      seq('(', $.call_subquery_argument, ')'),
    ),
    optional(seq($.keyword_into, $.bind_variable)),
  ),

  // CALL p(SELECT ...): a query without its own parentheses as the only argument.
  call_subquery_argument: $ => seq($.select, optional($.from)),

  // name => value; RECURSIVE is a keyword elsewhere but a plain argument name here (FLATTEN(..., RECURSIVE => TRUE))
  named_argument: $ => seq(
    field('name', choice($.identifier, alias($.keyword_recursive, $.identifier))),
    '=>',
    field('value', $._expression),
  ),

  // WITH name AS PROCEDURE (...) RETURNS ... [AS <body>] [, <cte> ...] CALL name(...) [INTO :var]
  call_with_anonymous_procedure: $ => seq(
    $.keyword_with,
    $.anonymous_procedure,
    repeat(seq(',', $.cte)),
    $.call_statement,
  ),

  anonymous_procedure: $ => seq(
    field('name', $.identifier),
    $.keyword_as,
    $.keyword_procedure,
    $.routine_arguments,
    repeat($._snowflake_routine_clause),
    $.routine_returns,
    repeat($._snowflake_routine_clause),
    optional($.routine_body),
  ),

  when_clause: $ => prec.left(seq(
    $.keyword_when,
    optional($.keyword_not),
    $.keyword_matched,
    optional(seq($.keyword_and, field('predicate', $._expression))),
    $.keyword_then,
    choice(
      $.keyword_delete,
      seq($.keyword_update, choice($._set_values, seq($.keyword_all, $.keyword_by, $.keyword_name))),
      seq($.keyword_insert, choice($._insert_values, seq($.keyword_all, $.keyword_by, $.keyword_name))),
    ),
  )),

  // SEMANTIC_VIEW( view [METRICS ..] [DIMENSIONS ..] [FACTS ..] [WHERE cond] )
  semantic_view_clause: $ => seq(
    $.keyword_semantic_view,
    '(',
    $.object_reference,
    repeat(choice(
      seq(choice($.keyword_metrics, $.keyword_dimensions, $.keyword_facts), comma_list(seq($._expression, optional($._alias)), true)),
      seq($.keyword_where, $._expression),
    )),
    ')',
  ),

};
