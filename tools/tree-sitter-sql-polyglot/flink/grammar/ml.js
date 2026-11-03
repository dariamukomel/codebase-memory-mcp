import { comma_list } from '../../grammar/helpers.js';

// Helper: named or positional TVF argument
function tvf_arg($) {
  return choice(
    seq($.identifier, '=>', choice(
      seq($.keyword_table, $.object_reference),
      seq($.keyword_model, $.object_reference),
      $.descriptor_call,
      $._expression,
    )),
    seq($.keyword_table, $.object_reference),
    seq($.keyword_model, $.object_reference),
    $.descriptor_call,
    $._expression,
  );
}

export default {

  // ML_PREDICT(TABLE t, MODEL m, DESCRIPTOR(cols) [, CONFIG => MAP[...]])
  ml_predict_tvf: $ => seq(
    $.keyword_ml_predict,
    '(',
    comma_list(tvf_arg($), true),
    ')',
  ),

  // ML_EVALUATE(TABLE t, MODEL m, DESCRIPTOR(label_col))
  ml_evaluate_tvf: $ => seq(
    $.keyword_ml_evaluate,
    '(',
    comma_list(tvf_arg($), true),
    ')',
  ),

  // VECTOR_SEARCH(TABLE vt, tbl.vec_col, DESCRIPTOR(idx_col), top_k [, CONFIG => MAP[...]])
  vector_search_tvf: $ => seq(
    $.keyword_vector_search,
    '(',
    comma_list(tvf_arg($), true),
    ')',
  ),

};
