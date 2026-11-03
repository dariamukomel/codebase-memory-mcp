import { paren_list } from '../../grammar/helpers.js';

export default {

  // EXECUTE TASK task_name
  execute_task: $ => seq(
    $.keyword_execute,
    $.keyword_task,
    $.object_reference,
  ),

  // EXECUTE EXPERIMENT name
  execute_experiment: $ => seq($.keyword_execute, $.keyword_experiment, $.object_reference),

  // EXECUTE ALERT name
  execute_alert: $ => seq($.keyword_execute, $.keyword_alert, $.object_reference),

  // EXECUTE DCM PROJECT [IF EXISTS] name
  //   { PLAN [DELTA] [USING CONFIGURATION c [(k => v, ...)]] FROM '<path>' [OUTPUT_PATH '<path>']
  //   | DEPLOY [AS dep] [USING CONFIGURATION c [(...)]] FROM '<path>'
  //   | TEST ALL
  //   | PREVIEW name [USING CONFIGURATION c [(...)]] FROM '<path>' [LIMIT n]
  //   | PURGE AS dep }
  execute_dcm_project: $ => seq(
    $.keyword_execute, $.keyword_dcm, $.keyword_project,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_plan, optional($.keyword_delta), optional($._dcm_configuration), $._dcm_from, optional(seq($.keyword_output_path, alias($._literal_string, $.literal)))),
      seq($.keyword_deploy, optional(seq($.keyword_as, $.identifier)), optional($._dcm_configuration), $._dcm_from),
      seq($.keyword_test, $.keyword_all),
      seq($.keyword_preview, $.object_reference, optional($._dcm_configuration), $._dcm_from, optional(seq($.keyword_limit, alias($._integer, $.literal)))),
      seq($.keyword_purge, $.keyword_as, $.identifier),
    ),
  ),

  _dcm_configuration: $ => seq($.keyword_using, $.keyword_configuration, $.identifier, optional(paren_list($.named_argument, true))),

  _dcm_from: $ => seq($.keyword_from, alias($._literal_string, $.literal)),

  // EXECUTE [INFERENCE] JOB SERVICE IN COMPUTE POOL cp
  //   { FROM @stage SPECIFICATION_FILE = 'f' | FROM SPECIFICATION $$..$$ | WITH SPECIFICATION '..' FROM (query) | @stage/path }
  //   [USING (k => v)] [NAME = n] [ASYNC = b] [...]
  execute_job_service: $ => seq(
    $.keyword_execute, optional($.keyword_inference), $.keyword_job, $.keyword_service,
    $.keyword_in, $.keyword_compute, $.keyword_pool, $.object_reference,
    repeat(choice(
      seq($.keyword_with, $.keyword_specification, alias($._literal_string, $.literal)),
      seq($.keyword_from, choice(
        $.stage_ref,
        seq($.keyword_specification, alias($._literal_string, $.literal)),
        seq('(', $._dml_read, ')'),
      )),
      seq($.keyword_using, paren_list($.named_argument, true)),
      $.snowflake_property,
    )),
  ),

  // EXECUTE NOTEBOOK name([arg, ...])
  execute_notebook: $ => seq($.keyword_execute, $.keyword_notebook, $.object_reference, paren_list(alias($._literal_string, $.literal), false)),

  // EXECUTE NOTEBOOK PROJECT name <property> ...
  execute_notebook_project: $ => seq($.keyword_execute, $.keyword_notebook, $.keyword_project, $.object_reference, repeat($.snowflake_property)),

  // EXECUTE CODE BUNDLE name ENTRYPOINT = '..' [ARGUMENTS = ..] [WITH SPECIFICATION $$..$$]
  execute_code_bundle: $ => seq(
    $.keyword_execute, $.keyword_code, $.keyword_bundle, $.object_reference,
    repeat(choice(
      seq($.keyword_with, $.keyword_specification, alias($._literal_string, $.literal)),
      $.snowflake_property,
    )),
  ),

};
