import { comma_list, optional_parenthesis } from '../../grammar/helpers.js';

export default {

  // TABLESAMPLE BERNOULLI(n) | SYSTEM(n) ; overrides base ROWS/PERCENT/BUCKET form
  tablesample: $ => seq(
    $.keyword_tablesample,
    choice(
      seq($.keyword_bernoulli, '(', $._expression, ')'),
      seq($.keyword_system,    '(', $._expression, ')'),
    ),
  ),

  // No QUALIFY: Trino/Athena have no QUALIFY clause upstream.
  from: $ => seq(
    $.keyword_from,
    optional($.keyword_only),
    comma_list(field('relation', $.relation), true),
    repeat(
      choice(
        $.join,
        $.cross_join,
        $.lateral_join,
        $.lateral_cross_join,
      ),
    ),
    optional($.where),
    optional($.group_by),
    optional($.having),
    optional($.window_clause),
    optional($.order_by),
    optional($.limit),
    optional($.offset_fetch_clause),
  ),

  // Override relation to support MATCH_RECOGNIZE and TABLESAMPLE
  relation: $ => prec.right(
    seq(
      choice(
        $.subquery,
        $.invocation,
        $.object_reference,
        $.values,
      ),
      optional($.tablesample),
      optional($.match_recognize_clause),
      optional(
        seq(
          $._alias,
          optional(alias($._column_list, $.list)),
        ),
      ),
    ),
  ),

  // ── MATCH_RECOGNIZE ──────────────────────────────────────────────────────────
  // MATCH_RECOGNIZE (
  //   [PARTITION BY ...]  [ORDER BY ...]
  //   [MEASURES ...]
  //   [ONE ROW PER MATCH | ALL ROWS PER MATCH]
  //   [AFTER MATCH SKIP ...]
  //   PATTERN ( pattern_expr )
  //   DEFINE var AS expr [, ...]
  // )
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

  // MEASURES expr AS alias [, ...]
  measures_clause: $ => seq(
    $.keyword_measures,
    comma_list($.measure_item, true),
  ),

  measure_item: $ => seq(
    optional(choice($.keyword_running, $.keyword_final)),
    $._expression,
    $.keyword_as,
    field('alias', $.identifier),
  ),

  // ONE ROW PER MATCH | ALL ROWS PER MATCH
  rows_per_match: $ => seq(
    choice(
      seq($.keyword_one, $.keyword_row),
      seq($.keyword_all, $.keyword_rows),
    ),
    $.keyword_per,
    $.keyword_match,
  ),

  // AFTER MATCH SKIP { PAST LAST ROW | TO NEXT ROW | TO FIRST var | TO LAST var }
  after_match_skip: $ => seq(
    $.keyword_after,
    $.keyword_match,
    $.keyword_skip,
    choice(
      seq($.keyword_past, $.keyword_last, $.keyword_row),
      seq($.keyword_to, $.keyword_next, $.keyword_row),
      seq($.keyword_to, $.keyword_first, $.identifier),
      seq($.keyword_to, $.keyword_last, $.identifier),
    ),
  ),

  // PATTERN ( pattern_terms )
  pattern_clause: $ => seq(
    $.keyword_pattern,
    '(',
    repeat1($.pattern_term),
    ')',
  ),

  pattern_term: $ => seq(
    choice(
      $.identifier,
      seq('(', repeat1($.pattern_term), ')'),
    ),
    optional(choice('+', '*', '?')),
  ),

  // DEFINE var AS expr [, ...]
  define_clause: $ => seq(
    $.keyword_define,
    comma_list($.define_item, true),
  ),

  define_item: $ => seq(
    $.identifier,
    $.keyword_as,
    $._expression,
  ),

  // Trino: SELECT … FOR UPDATE (#113)
  _select_statement: $ => optional_parenthesis(
    seq(
      $.select,
      optional(
        seq(
          $.keyword_into,
          $.select_expression,
        ),
      ),
      optional($.from),
      optional($.locking_clause),
    ),
  ),

  locking_clause: $ => seq(
    $.keyword_for,
    $.keyword_update,
  ),

};
