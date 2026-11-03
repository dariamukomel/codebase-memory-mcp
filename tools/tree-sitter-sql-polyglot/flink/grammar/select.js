import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // DESCRIPTOR(col1, col2, ...); special TVF argument
  descriptor_call: $ => seq(
    $.keyword_descriptor,
    paren_list($.identifier, true),
  ),

  // Window TVF call; used inside TABLE(window_tvf(...))
  // TUMBLE(TABLE t, DESCRIPTOR(time_col), INTERVAL '...')
  tumble_tvf: $ => seq(
    $.keyword_tumble,
    '(',
    $.keyword_table,
    field('input', $.object_reference),
    ',',
    field('timecol', $.descriptor_call),
    ',',
    field('size', $.interval),
    optional(seq(',', field('offset', $.interval))),
    ')',
  ),

  // HOP(TABLE t, DESCRIPTOR(time_col), slide, size)
  hop_tvf: $ => seq(
    $.keyword_hop,
    '(',
    $.keyword_table,
    field('input', $.object_reference),
    ',',
    field('timecol', $.descriptor_call),
    ',',
    field('slide', $.interval),
    ',',
    field('size', $.interval),
    optional(seq(',', field('offset', $.interval))),
    ')',
  ),

  // CUMULATE(TABLE t, DESCRIPTOR(time_col), step, max_size)
  cumulate_tvf: $ => seq(
    $.keyword_cumulate,
    '(',
    $.keyword_table,
    field('input', $.object_reference),
    ',',
    field('timecol', $.descriptor_call),
    ',',
    field('step', $.interval),
    ',',
    field('max_size', $.interval),
    optional(seq(',', field('offset', $.interval))),
    ')',
  ),

  // SESSION(TABLE t, DESCRIPTOR(time_col), gap)
  session_tvf: $ => seq(
    $.keyword_session,
    '(',
    $.keyword_table,
    field('input', $.object_reference),
    ',',
    field('timecol', $.descriptor_call),
    ',',
    field('gap', $.interval),
    ')',
  ),

  // Generic window TVF dispatch
  window_tvf: $ => choice(
    $.tumble_tvf,
    $.hop_tvf,
    $.cumulate_tvf,
    $.session_tvf,
  ),

  // FOR SYSTEM_TIME AS OF expr; temporal join clause
  for_system_time_as_of: $ => seq(
    $.keyword_for,
    $.keyword_system_time,
    $.keyword_as,
    $.keyword_of,
    field('time_point', $._expression),
  ),

  // Override relation to allow TABLE(window_tvf(...)), TABLE(invocation), temporal join sources
  relation: $ => prec.right(
    choice(
      // Flink: [LATERAL] TABLE(window_tvf_call) or TABLE(table_function),
      // with an optional AS alias and column list (LATERAL TABLE join).
      seq(
        optional($.keyword_lateral),
        $.keyword_table,
        '(',
        choice($.window_tvf, $.invocation),
        ')',
        optional(seq($._alias, optional(alias($._column_list, $.list)))),
      ),
      // Flink: ML TVFs used directly in FROM
      seq(
        choice($.ml_predict_tvf, $.ml_evaluate_tvf, $.vector_search_tvf),
        optional($._alias),
      ),
      // Base with optional FOR SYSTEM_TIME AS OF (temporal join)
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.tablesample),
        optional($.for_system_time_as_of),
        optional($.match_recognize_clause),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),
  ),

};
