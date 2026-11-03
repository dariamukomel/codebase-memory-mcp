import { optional_parenthesis, paren_list, wrapped_in_parenthesis } from "./helpers.js";

// FROM start, USING units, OCCURRENCE n, GROUP n: each optional, in this order (ISO 9075 regex functions).
function regex_options($) {
  return [
    optional(seq($.keyword_from, $._expression)),
    optional(seq($.keyword_using, choice($.keyword_characters, $.keyword_octets))),
    optional(seq($.keyword_occurrence, $._expression)),
    optional(seq($.keyword_group, $._expression)),
  ];
}

export default {

  _expression: $ => prec(1,
    choice(
      $.literal,
      alias(
        $._qualified_field,
        $.field,
      ),
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
      $.typed_temporal_literal,
      $.datetime_value_function,
      $.like_expression,
    )
  ),

    object_reference: $ => choice(
      seq(
        field('database', $.identifier),
        '.',
        field('schema', $.identifier),
        '.',
        field('name', $.identifier),
      ),
      seq(
        field('schema', $.identifier),
        '.',
        field('name', $.identifier),
      ),
      field('name', $.identifier),
    ),

    // Keep a delimited runtime reference as one opaque lexical atom. For the
    // unbraced form, keep the complete dotted name (`$app.schema.table`) in
    // one node; `$app.$table` remains two components of object_reference.
    dynamic_identifier: _ => token(
      /\$\{[^}\r\n]+\}|\$[A-Za-z_\u00C0-\u017F][0-9A-Za-z_\u00C0-\u017F]*(?:\.[A-Za-z_\u00C0-\u017F][0-9A-Za-z_\u00C0-\u017F]*)*/,
    ),

    field: $ => field('name', $.identifier),

    _qualified_field: $ => seq(
      optional(
        seq(
          field('qualifier', optional_parenthesis($.object_reference)),
          '.',
        ),
      ),
      field('name', $.identifier),
    ),

  parameter: $ => /\?|(\$[0-9]+)/,

  case: $ => seq(
    $.keyword_case,
    choice(
      // simplified CASE x WHEN
      seq(
        $._expression,
        $.keyword_when,
        $._expression,
        $.keyword_then,
        $._expression,
        repeat(
          seq(
            $.keyword_when,
            $._expression,
            $.keyword_then,
            $._expression,
          )
        ),
      ),
      // standard CASE WHEN x, where x must be a predicate
      seq(
        $.keyword_when,
        $._expression,
        $.keyword_then,
        $._expression,
        repeat(
          seq(
            $.keyword_when,
            $._expression,
            $.keyword_then,
            $._expression,
          )
        ),
      ),
    ),
    optional(
      seq(
        $.keyword_else,
        $._expression,
      )
    ),
    $.keyword_end,
  ),

  cast: $ => seq(
    field('name', $.keyword_cast),
    wrapped_in_parenthesis(
      seq(
        field('parameter', $._expression),
        $.keyword_as,
        $._type,
      ),
    ),
  ),

  exists: $ => seq(
    $.keyword_exists,
    $.subquery,
  ),

  invocation: $ => prec(1,
    seq(
      $.object_reference,
      choice(
        // default invocation
        paren_list(
          seq(
            optional($.keyword_distinct),
            field(
              'parameter',
              choice($.term, $.named_argument),
            ),
            optional($.order_by)
          )
        ),
        // https://dev.mysql.com/doc/refman/8.4/en/date-and-time-functions.html#function_extract
        paren_list(
          seq(
            field(
              'unit',
              $.object_reference,
            ),
            $.keyword_from,
            $.term
          )
        ),
        // _aggregate_function, e.g. group_concat
        wrapped_in_parenthesis(
          seq(
            optional($.keyword_distinct),
            field('parameter', $.term),
            optional($.order_by),
            optional(seq(
              choice($.keyword_separator, ','),
              alias($._literal_string, $.literal)
            )),
            optional($.limit),
          ),
        ),
      ),
      optional($.filter_expression),
      optional($.within_group),
    ),
  ),

  filter_expression: $ => seq(
    $.keyword_filter,
    wrapped_in_parenthesis($.where),
  ),

  within_group: $ => seq(
    $.keyword_within,
    $.keyword_group,
    wrapped_in_parenthesis($.order_by),
  ),

  // TRIM([{BOTH|LEADING|TRAILING} [trim_char] FROM] string)
  trim_expression: $ => seq(
    $.keyword_trim,
    '(',
    choice(
      seq(
        choice($.keyword_leading, $.keyword_trailing, $.keyword_both),
        optional($._expression),
        $.keyword_from,
        $._expression,
      ),
      seq($._expression, $.keyword_from, $._expression),
      $._expression,
    ),
    ')',
  ),

  // ISO 9075 <character position expression>:
  //   POSITION ( <character value expression> IN <character value expression> [ USING <char length units> ] )
  // The needle cannot be a bare binary expression: `a IN b` there would parse as the IN operator.
  position_expression: $ => seq(
    alias($._position_call, $.keyword_position),
    '(',
    field('needle', $._position_operand),
    $.keyword_in,
    field('haystack', $._expression),
    optional(seq($.keyword_using, choice($.keyword_characters, $.keyword_octets))),
    ')',
  ),

  // <regex position expression>:
  //   POSITION_REGEX ( [ START | AFTER ] pattern [ FLAG f ] IN subject [ FROM n ] [ USING units ]
  //                    [ OCCURRENCE n ] [ GROUP n ] )
  regex_position_expression: $ => seq(
    alias($._position_regex_call, $.keyword_position_regex),
    '(',
    optional(choice($.keyword_start, $.keyword_after)),
    field('pattern', $._position_operand),
    optional(seq($.keyword_flag, $.literal)),
    $.keyword_in,
    field('subject', $._expression),
    ...regex_options($),
    ')',
  ),

  // <regex substring function>:
  //   SUBSTRING_REGEX ( pattern [ FLAG f ] IN subject [ FROM n ] [ USING units ] [ OCCURRENCE n ] [ GROUP n ] )
  regex_substring_expression: $ => seq(
    alias($._substring_regex_call, $.keyword_substring_regex),
    '(',
    field('pattern', $._position_operand),
    optional(seq($.keyword_flag, $.literal)),
    $.keyword_in,
    field('subject', $._expression),
    ...regex_options($),
    ')',
  ),

  _position_operand: $ => choice(
    $.literal,
    alias($._qualified_field, $.field),
    $.parameter,
    $.invocation,
    $.cast,
    $.parenthesized_expression,
    $.trim_expression,
  ),

  parenthesized_expression: $ => prec(2,
    wrapped_in_parenthesis($._expression)
  ),

  subscript: $ => prec.left('binary_is',
    seq(
      field('expression', $._expression),
      "[",
      choice(
        field('subscript', $._expression),
        // Slice: [lower:upper], and open-ended [lower:] / [:upper] / [:]
        seq(
          optional(field('lower', $._expression)),
          ':',
          optional(field('upper', $._expression)),
        ),
      ),
      "]",
    ),
  ),

  op_other: $ => token(
    choice(
      '->',
      '->>',
      '#>',
      '#>>',
      '~',
      '!~',
      '~*',
      '!~*',
      '|',
      '&',
      '#',
      '<<',
      '>>',
      '<<=',
      '>>=',
      '##',
      '<->',
      '@>',
      '<@',
      '&<',
      '&>',
      '|>>',
      '<<|',
      '&<|',
      '|&>',
      '<^',
      '^>',
      '?#',
      '?-',
      '?|',
      '?-|',
      '?||',
      '@@',
      '@@@',
      '@?',
      '#-',
      '?&',
      '?',
      '-|-',
      '||',
      '^@',
    ),
  ),

  binary_expression: $ => choice(
    ...[
      ['+', 'binary_plus'],
      ['-', 'binary_plus'],
      ['*', 'binary_times'],
      ['/', 'binary_times'],
      ['%', 'binary_times'],
      ['^', 'binary_exp'],
      ['=', 'binary_relation'],
      ['<', 'binary_relation'],
      ['<=', 'binary_relation'],
      ['!=', 'binary_relation'],
      ['>=', 'binary_relation'],
      ['>', 'binary_relation'],
      ['<>', 'binary_relation'],
      [$.op_other, 'binary_other'],
      [$.keyword_is, 'binary_is'],
      [$.is_not, 'binary_is'],
      // LIKE / NOT LIKE are handled exclusively by like_expression below (with
      // its optional ESCAPE tail); NOT duplicated here. Two rules deriving
      // the identical "expr LIKE expr" span would force GLR to carry both
      // interpretations through every nested expression containing a LIKE,
      // which is expensive enough to blow the parse table for large dialect
      // grammars (observed: teradata/clickhouse failed to generate under 12+
      // minutes with the duplicate). One rule, no ambiguity, no explosion.
      [$.keyword_rlike, 'pattern_matching'],
      [$.not_rlike, 'pattern_matching'],
      [$.similar_to, 'pattern_matching'],
      [$.not_similar_to, 'pattern_matching'],
      // binary_is precedence disambiguates `(is not distinct from)` from an
      // `is (not distinct from)` with a unary `not`
      [$.distinct_from, 'binary_is'],
      [$.not_distinct_from, 'binary_is'],
    ].map(([operator, precedence]) =>
      prec.left(precedence, seq(
        field('left', $._expression),
        field('operator', operator),
        field('right', $._expression)
      ))
    ),
    ...[
      [$.keyword_and, 'clause_connective'],
      [$.keyword_or, 'clause_disjunctive'],
    ].map(([operator, precedence]) =>
      prec.left(precedence, seq(
        field('left', $._expression),
        field('operator', operator),
        field('right', $._expression)
      ))
    ),
    ...[
      [$.keyword_in, 'binary_in'],
      [$.not_in, 'binary_in'],
    ].map(([operator, precedence]) =>
      prec.left(precedence, seq(
        field('left', $._expression),
        field('operator', operator),
        field('right', choice($.list, $.subquery))
      ))
    ),
  ),

  op_unary_other: $ => token(
    choice(
      '|/',
      '||/',
      '@',
      '~',
      '@-@',
      '@@',
      '#',
      '?-',
      '?|',
      '!!',
    ),
  ),

  unary_expression: $ => choice(
    ...[
      [$.keyword_not, 'unary_not'],
      [$.bang, 'unary_not'],
      [$.keyword_any, 'unary_not'],
      [$.keyword_some, 'unary_not'],
      [$.keyword_all, 'unary_not'],
      [$.op_unary_other, 'unary_other'],
    ].map(([operator, precedence]) =>
      prec.left(precedence, seq(
        field('operator', operator),
        field('operand', $._expression)
      ))
    ),
    $._signed_operand,
  ),

  // ISO <sign> <numeric value expression>. The operand excludes literals because a numeric literal
  // already carries its own optional sign (-1 is one literal), and both readings would be ambiguous.
  _signed_operand: $ => prec.left('unary_other', seq(
    field('operator', choice('-', '+')),
    field('operand', choice(
      alias($._qualified_field, $.field),
      $.invocation,
      $.parenthesized_expression,
      $.cast,
      $.case,
      $.window_function,
    )),
  )),

  // Postgres syntax for intervals
  // prec.right greedily attaches the optional trailing qualifier
  // (INTERVAL '1' DAY -> qualifier=DAY) instead of reducing INTERVAL '1' and
  // leaving DAY to a following context (e.g. an implicit select alias). This
  // resolves the interval shift/reduce statically, so it no longer needs a
  // declared GLR [$.interval] self-conflict. Parse trees are unchanged
  // (INTERVAL '1' DAY still yields interval with qualifier: DAY).
  interval: $ => prec.right(seq(
    $.keyword_interval,
    $._literal_string,
    optional(field('qualifier', $.identifier)),
    optional(seq($.keyword_to, field('end_qualifier', $.identifier))),
  )),

  between_expression: $ => choice(
    ...[
          [$.keyword_between, 'between'],
          [seq($.keyword_not, $.keyword_between), 'between'],
      ].map(([operator, precedence]) =>
              prec.left(precedence, seq(
              field('left', $._expression),
              field('operator', operator),
              optional(choice($.keyword_symmetric, $.keyword_asymmetric)),
              field('low', $._expression),
              $.keyword_and,
              field('high', $._expression)
          ))
      ),
  ),

  not_in: $ => seq(
    $.keyword_not,
    $.keyword_in,
  ),

  // ANSI LIKE ... ESCAPE (E061-05). The SOLE rule for `expr LIKE expr`; it is
  // NOT also listed in binary_expression's operator map. Deriving the same
  // "expr LIKE expr" span two different ways (once here, once as a plain
  // binary_expression) forces GLR to keep both interpretations alive across
  // every nested expression containing a LIKE, which explodes the parse table
  // for large dialect grammars (teradata/clickhouse failed to generate under
  // that duplication). One rule, no ambiguity: ESCAPE is simply optional.
  like_expression: $ => prec.left('pattern_matching', seq(
    field('left', $._expression),
    field('operator', choice($.keyword_like, $.not_like)),
    field('right', $._expression),
    optional(seq($.keyword_escape, field('escape', $._expression))),
  )),

  // ANSI typed temporal literals (F051-03): DATE '…', TIME '…', TIMESTAMP '…'.
  typed_temporal_literal: $ => prec(2, seq(
    field('type', choice($.keyword_date, $.keyword_time, $.keyword_timestamp)),
    field('value', alias($._literal_string, $.literal)),
  )),

  // ANSI datetime value functions (F051-06): niladic CURRENT_DATE / CURRENT_TIME
  // / CURRENT_TIMESTAMP / LOCALTIME / LOCALTIMESTAMP, with optional precision on
  // the time-bearing forms.
  datetime_value_function: $ => choice(
    $.keyword_current_date,
    // prec.right so that after CURRENT_TIME/TIMESTAMP/LOCALTIME[STAMP] a
    // following `(` is shifted as the optional precision rather than reducing
    // the niladic form (a shift/reduce that surfaces in some dialects).
    prec.right(2, seq(
      choice(
        $.keyword_current_time,
        $.keyword_current_timestamp,
        $.keyword_localtime,
        $.keyword_localtimestamp,
      ),
      optional(wrapped_in_parenthesis(alias($._natural_number, $.literal))),
    )),
  ),

  subquery: $ => wrapped_in_parenthesis(
    $._dml_read
  ),

  list: $ => paren_list($._expression),

  literal: $ => prec(2,
    choice(
      $._integer,
      $._decimal_number,
      $._literal_string,
      $._bit_string,
      $.keyword_true,
      $.keyword_false,
      $.keyword_null,
    ),
  ),
  _double_quote_string: _ => /"[^"]*"/,
  _single_quote_string: _ => seq(
    /([uU]&|[nN])?'([^']|'')*'/,
    repeat(/'([^']|'')*'/),
  ),

  _literal_string: $ => prec(
    1,
    $._single_quote_string,
  ),
  _natural_number: _ => /\d+/,
  _integer: $ => seq(
    optional(choice("-", "+")),
    /(0[xX][0-9A-Fa-f]+(_[0-9A-Fa-f]+)*)|(0[oO][0-7]+(_[0-7]+)*)|(0[bB][01]+(_[01]+)*)|(\d+(_\d+)*(e[+-]?\d+(_\d+)*)?)/
  ),
  _decimal_number: $ => seq(
    optional(
      choice("-", "+")),
    /((\d+(_\d+)*)?[.]\d+(_\d+)*(e[+-]?\d+(_\d+)*)?)|(\d+(_\d+)*[.](\d+(_\d+)*)?e[+-]?\d+(_\d+)*)/
  ),
  _bit_string: $ => seq(/[bBxX]'([^']|'')*'/, repeat(/'([^']|'')*'/)),

  bang: _ => '!',

  identifier: $ => choice(
    $._identifier,
    $.dynamic_identifier,
    $.dynamic_composite_identifier,
    $._double_quote_string,
  ),

  // An identifier containing both static and runtime-generated parts, e.g.
  // `orders_${suffix}`, `${prefix}_orders`, or `a_${x}_b_${y}`. Dynamic
  // fragments remain separate CST nodes inside the composite identifier.
  dynamic_composite_identifier: $ => prec.right(1, choice(
    seq(
      $._identifier,
      repeat1(seq($.dynamic_identifier, optional($._identifier))),
    ),
    seq(
      $.dynamic_identifier,
      $._identifier,
      repeat(seq($.dynamic_identifier, optional($._identifier))),
    ),
  )),
  _identifier: _ => /[A-Za-z_\u00C0-\u017F][0-9A-Za-z_\u00C0-\u017F]*/,

};
