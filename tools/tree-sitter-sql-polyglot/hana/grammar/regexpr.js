// SAP HANA regular-expression functions take `pattern IN subject` like the ISO POSITION_REGEX /
// SUBSTRING_REGEX forms: OCCURRENCES_REGEXPR, SUBSTR_REGEXPR, SUBSTRING_REGEXPR, LOCATE_REGEXPR, REPLACE_REGEXPR.
// The name is its own token (anything ending in _REGEXPR) so only these calls take the IN form.
export default {

  _hana_regexpr_name: _ => token(/[A-Za-z]+_[rR][eE][gG][eE][xX][pP][rR]/),

  hana_regexpr_function: $ => seq(
    field('name', alias($._hana_regexpr_name, $.identifier)),
    '(',
    optional(choice($.keyword_start, $.keyword_after)),
    field('pattern', $._position_operand),
    optional(seq($.keyword_flag, $.literal)),
    $.keyword_in,
    field('subject', $._expression),
    optional(seq($.keyword_from, $._expression)),
    optional(seq($.keyword_occurrence, $._expression)),
    optional(seq($.keyword_group, $._expression)),
    optional(seq($.keyword_with, $._expression)),
    ')',
  ),

  // Base _expression plus the HANA regexpr functions.
  _expression: $ => prec(1,
    choice(
      $.literal,
      alias($._qualified_field, $.field),
      $.parameter,
      $.list,
      $.case,
      $.window_function,
      $.subquery,
      $.cast,
      $.exists,
      $.invocation,
      $.binary_expression,
      $.subscript,
      $.unary_expression,
      $.array,
      $.interval,
      $.between_expression,
      $.parenthesized_expression,
      $.trim_expression,
      $.position_expression,
      $.regex_position_expression,
      $.regex_substring_expression,
      $.hana_regexpr_function,
      $.typed_temporal_literal,
      $.datetime_value_function,
      $.like_expression,
    )
  ),

};
