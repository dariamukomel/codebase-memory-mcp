import { comma_list, paren_list } from '../../grammar/helpers.js';

// Teradata statements from the v20.00 SQL Data Manipulation Language manual's
// "Statement Syntax" and "Query and Workload Analysis Statements" sections,
// read through the docs.teradata.com Fluid Topics API
// (/api/khub/maps/{mapId}/topics/{contentId}/content).
export default {

  // CALL [db.]procedure ( arg [,...] )
  // Arguments are value expressions, ? placeholders or CAST(OUT ph AS type),
  // all of which the base expression rule already covers.
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    paren_list($._expression, false),
  ),

  // DUMP EXPLAIN INTO qcd [AS plan] [LIMIT [SQL [= n]]] [CHECK STATISTICS]
  //   <request>
  // Modelled as a prefix clause on `statement`, the way base handles the
  // EXPLAIN modifier. Making the request a suffix of this rule instead
  // duplicates the whole DML state machine inside it, and generation stops
  // finishing in reasonable time.
  dump_explain_clause: $ => seq(
    $.keyword_dump,
    $.keyword_explain,
    $._qcd_target,
    optional($._explain_limit),
    optional(seq($.keyword_check, $.keyword_statistics)),
  ),

  // INTO qcd [AS plan_name]
  _qcd_target: $ => seq(
    $.keyword_into,
    field('qcd', $.object_reference),
    optional(seq($.keyword_as, field('plan_name', $.identifier))),
  ),

  // LIMIT [SQL [= n]]
  _explain_limit: $ => prec.right(seq(
    $.keyword_limit,
    optional(seq(
      $.keyword_sql,
      optional(seq('=', field('limit', $.literal))),
    )),
  )),

  // INITIATE INDEX ANALYSIS [ON t [,...]] FOR workload IN qcd AS tag
  //   [SET opt = value [,...]] [KEEP INDEX]
  //   [USE MODIFIED {STATISTICS | STATS | STAT}]
  //   WITH [NO] INDEX TYPE n [,...] [CHECKPOINT n] [TIME LIMIT = t]
  initiate_index_analysis_statement: $ => seq(
    $.keyword_initiate,
    $.keyword_index,
    $.keyword_analysis,
    $._workload_analysis_target,
    optional(seq($.keyword_set, comma_list($._analysis_boundary, true))),
    optional(seq($.keyword_keep, $.keyword_index)),
    optional(seq(
      $.keyword_use,
      $.keyword_modified,
      choice($.keyword_statistics, $.keyword_stats, $.keyword_stat),
    )),
    $.keyword_with,
    optional($.keyword_no),
    $.keyword_index,
    $.keyword_type,
    comma_list(field('index_type', $.literal), true),
    optional($._analysis_checkpoint),
    optional($._analysis_time_limit),
  ),

  // INITIATE PARTITION ANALYSIS [ON t [,...]] FOR workload IN qcd AS tag
  //   [TIME LIMIT = t]
  initiate_partition_analysis_statement: $ => seq(
    $.keyword_initiate,
    $.keyword_partition,
    $.keyword_analysis,
    $._workload_analysis_target,
    optional($._analysis_time_limit),
  ),

  // RESTART INDEX ANALYSIS FOR workload IN qcd AS tag
  //   [CHECKPOINT n] [TIME LIMIT = t]
  restart_index_analysis_statement: $ => seq(
    $.keyword_restart,
    $.keyword_index,
    $.keyword_analysis,
    $._workload_analysis_target,
    optional($._analysis_checkpoint),
    optional($._analysis_time_limit),
  ),

  // [ON table [,...]] FOR workload IN qcd AS tag
  _workload_analysis_target: $ => seq(
    optional(seq($.keyword_on, comma_list($.object_reference, true))),
    $.keyword_for,
    field('workload', $.identifier),
    $.keyword_in,
    field('qcd', $.object_reference),
    $.keyword_as,
    field('tag', $.identifier),
  ),

  // <boundary_option> = <value>
  _analysis_boundary: $ => seq(
    field('name', $.identifier),
    '=',
    field('value', $.literal),
  ),

  _analysis_checkpoint: $ => seq(
    $.keyword_checkpoint,
    field('checkpoint', $.literal),
  ),

  _analysis_time_limit: $ => seq(
    $.keyword_time,
    $.keyword_limit,
    '=',
    field('time_limit', $.literal),
  ),

  // INSERT EXPLAIN [WITH [NO] STATISTICS [USING SAMPLE pct [PERCENT]]]
  //   [AND DEMOGRAPHICS] [FOR t [,...]] INTO qcd [AS plan]
  //   [LIMIT [SQL [= n]]] [FOR frequency] [CHECK STATISTICS]
  //   [IN XML [NODDLTEXT]] <request>
  // The two FOR clauses are separated by the mandatory INTO, so neither is
  // ambiguous with the other.
  insert_explain_clause: $ => seq(
    $.keyword_insert,
    $.keyword_explain,
    optional(seq(
      $.keyword_with,
      optional($.keyword_no),
      $.keyword_statistics,
      optional(seq(
        $.keyword_using,
        $.keyword_sample,
        field('percentage', $.literal),
        optional($.keyword_percent),
      )),
    )),
    optional(seq($.keyword_and, $.keyword_demographics)),
    optional(seq($.keyword_for, comma_list($.object_reference, true))),
    $._qcd_target,
    optional($._explain_limit),
    optional(seq($.keyword_for, field('frequency', $.literal))),
    optional(seq($.keyword_check, $.keyword_statistics)),
    optional(seq($.keyword_in, $.keyword_xml, optional($.keyword_noddltext))),
  ),

  // EXECUTE FUNCTION [COLUMNS (name [,...])] [INTO [VOLATILE] ART]
  //   function ( argument [,...] )
  // The named argument groups (FUNC_PARAMS, INPUT_FMT, OUTPUT_FMT, MAP) are
  // function-call shaped, so the base expression rule already accepts them.
  execute_function_statement: $ => seq(
    $.keyword_execute,
    $.keyword_function,
    optional(seq($.keyword_columns, paren_list($.identifier, true))),
    optional(seq($.keyword_into, optional($.keyword_volatile), $.keyword_art)),
    field('name', $.object_reference),
    paren_list($._expression, false),
  ),

  // USING ( name type [,...] ) <request>
  using_request_clause: $ => seq(
    $.keyword_using,
    paren_list($._using_variable, true),
  ),

  _using_variable: $ => seq(
    field('name', $.identifier),
    field('type', $._type),
  ),

};
