import { comma_list, paren_list } from '../../grammar/helpers.js';

// MATCH_RECOGNIZE: https://docs.snowflake.com/en/sql-reference/constructs/match_recognize
export default {

  match_recognize_clause: $ => seq(
    $.keyword_match_recognize,
    '(',
    optional($.partition_by),
    optional($.order_by),
    optional($.measures_clause),
    optional($.rows_per_match),
    optional($.after_match_skip),
    $.pattern_clause,
    $.define_clause,
    ')',
  ),

  // MEASURES [FINAL | RUNNING] expr AS alias [, ...]
  measures_clause: $ => seq(
    $.keyword_measures,
    comma_list($.measure_item, true),
  ),

  measure_item: $ => seq(
    optional(choice($.keyword_final, $.keyword_running)),
    $._expression,
    optional($.keyword_as),
    field('alias', $.identifier),
  ),

  // ONE ROW PER MATCH | ALL ROWS PER MATCH [SHOW EMPTY MATCHES | OMIT EMPTY MATCHES | WITH UNMATCHED ROWS]
  rows_per_match: $ => seq(
    choice(
      seq($.keyword_one, $.keyword_row),
      seq($.keyword_all, $.keyword_rows),
    ),
    $.keyword_per,
    $.keyword_match,
    optional(choice(
      seq($.keyword_show, $.keyword_empty, $.keyword_matches),
      seq($.keyword_omit, $.keyword_empty, $.keyword_matches),
      seq($.keyword_with, $.keyword_unmatched, $.keyword_rows),
    )),
  ),

  // AFTER MATCH SKIP { PAST LAST ROW | TO NEXT ROW | TO [FIRST | LAST] <symbol> }
  after_match_skip: $ => seq(
    $.keyword_after,
    $.keyword_match,
    $.keyword_skip,
    choice(
      seq($.keyword_past, $.keyword_last, $.keyword_row),
      seq($.keyword_to, $.keyword_next, $.keyword_row),
      seq($.keyword_to, optional(choice($.keyword_first, $.keyword_last)), $.identifier),
    ),
  ),

  // PATTERN ( <row pattern> ): alternation, concatenation, groups, anchors, exclusion, PERMUTE, quantifiers
  pattern_clause: $ => seq(
    $.keyword_pattern,
    '(',
    $._pattern_alternation,
    ')',
  ),

  _pattern_alternation: $ => seq($._pattern_sequence, repeat(seq('|', $._pattern_sequence))),

  _pattern_sequence: $ => repeat1($.pattern_term),

  pattern_term: $ => prec.right(choice(
    '^',
    '$',
    seq('{', '-', $._pattern_alternation, '-', '}'),
    seq(
      choice(
        $.identifier,
        seq('(', $._pattern_alternation, ')'),
        seq($.keyword_permute, paren_list($.identifier, true)),
      ),
      optional($.pattern_quantifier),
    ),
  )),

  // + * ? {n} {n,} {,m} {n,m}, each optionally lazy (followed by ?)
  pattern_quantifier: $ => seq(
    choice(
      '+', '*', '?',
      seq('{', optional(alias($._natural_number, $.literal)), optional(seq(',', optional(alias($._natural_number, $.literal)))), '}'),
    ),
    optional('?'),
  ),

  define_clause: $ => seq(
    $.keyword_define,
    comma_list($.define_item, true),
  ),

  define_item: $ => seq(
    $.identifier,
    $.keyword_as,
    $._expression,
  ),

};
