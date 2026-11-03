export default {

  // ML.PREDICT(MODEL my_model, TABLE input_table)
  // ML.EVALUATE(MODEL my_model, TABLE test_table)
  // ML.PREDICT(MODEL my_model, (SELECT ...))
  ml_function: $ => seq(
    $.keyword_ml,
    '.',
    choice($.keyword_predict, $.keyword_evaluate, $.identifier),
    '(',
    $.keyword_model,
    $.object_reference,
    ',',
    choice(
      seq($.keyword_table, $.object_reference),
      $.subquery,
    ),
    optional(seq(',', $.options_clause)),
    ')',
  ),

};
