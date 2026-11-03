export default {

  create_procedure: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional(seq($.keyword_definer, '=', $.identifier)),
    $.keyword_procedure,
    optional($._if_not_exists),
    $.object_reference,
    optional($.function_arguments),
    repeat(
      choice(
        $.function_language,
        $.function_security,
        $.function_safety,
      ),
    ),
    $.procedure_body,
    repeat(
      choice(
        $.function_language,
        $.function_security,
        $.function_safety,
      ),
    ),
  ),

  procedure_body: $ => choice(
    seq(
      $.keyword_begin,
      $.keyword_atomic,
      repeat1(
        seq(
          $._function_body_statement,
          ';',
        ),
      ),
      $.keyword_end,
    ),
    seq(
      $.keyword_as,
      alias($._single_quote_string, $.literal),
    ),
  ),

};
