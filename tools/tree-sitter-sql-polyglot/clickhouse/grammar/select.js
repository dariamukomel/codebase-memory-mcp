import { comma_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // PREWHERE <expr>; ClickHouse pre-filtering, sits before WHERE
  prewhere: $ => seq(
    $.keyword_prewhere,
    field('predicate', $._expression),
  ),

  // [LEFT] ARRAY JOIN expr [AS alias] [, ...]
  array_join: $ => seq(
    optional($.keyword_left),
    $.keyword_array,
    $.keyword_join,
    comma_list($.array_join_item, true),
  ),

  array_join_item: $ => seq(
    $._expression,
    optional(seq(optional($.keyword_as), field('alias', $.identifier))),
  ),

  // FINAL; read merged/collapsed rows
  // SAMPLE k | SAMPLE 0.1 | SAMPLE 1/10 [OFFSET 3/10]
  sample_clause: $ => seq(
    $.keyword_sample,
    field('ratio', $._sample_ratio),
    optional(seq(
      $.keyword_offset,
      field('offset', $._sample_ratio),
    )),
  ),

  // a literal, optionally as a fraction n / m
  _sample_ratio: $ => seq(
    $.literal,
    optional(seq('/', $.literal)),
  ),

  // QUALIFY <expr>; filter on window-function results (post-WINDOW)
  qualify: $ => seq(
    $.keyword_qualify,
    field('predicate', $._expression),
  ),

  // INTO OUTFILE 'path' [COMPRESSION 'method']; trailing, before FORMAT
  into_outfile_clause: $ => seq(
    $.keyword_into,
    $.keyword_outfile,
    alias($._literal_string, $.literal),
  ),

  // FORMAT <Name> trailing output clause
  format_clause: $ => seq(
    $.keyword_format,
    field('format', $.identifier),
  ),

  // SETTINGS k = v, ... (query-level)
  settings_clause: $ => seq(
    $.keyword_settings,
    comma_list($.setting_item, true),
  ),

  setting_item: $ => seq(
    field('name', $.identifier),
    '=',
    field('value', choice($.literal, $.identifier)),
  ),

  // Override relation to attach FINAL and SAMPLE to a table source
  relation: $ => prec.right(
    seq(
      choice(
        $.subquery,
        $.invocation,
        $.object_reference,
        wrapped_in_parenthesis($.values),
      ),
      optional($.keyword_final),
      optional($.sample_clause),
      optional($.tablesample),
      optional(
        seq(
          $._alias,
          optional(alias($._column_list, $.list)),
        ),
      ),
    ),
  ),

  // Override from to add PREWHERE, ARRAY JOIN, LIMIT BY, SETTINGS, FORMAT
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
        $.array_join,
      ),
    ),
    optional($.prewhere),
    optional($.where),
    optional($.group_by),
    optional($.having),
    optional($.window_clause),
    optional($.qualify),
    optional($.order_by),
    optional($.limit),
    optional($.settings_clause),
    optional($.into_outfile_clause),
    optional($.format_clause),
  ),

  // Override order_target to add ClickHouse WITH FILL [FROM x] [TO y] [STEP z]
  order_target: $ => prec.right(seq(
    $._expression,
    optional(
      seq(
        choice(
          $.direction,
          seq($.keyword_using, choice('<', '>', '<=', '>=')),
        ),
        optional(seq($.keyword_nulls, choice($.keyword_first, $.keyword_last))),
      ),
    ),
    optional($.with_fill),
  )),

  // WITH FILL [FROM expr] [TO expr] [STEP expr]
  with_fill: $ => seq(
    $.keyword_with,
    $.keyword_fill,
    optional(seq($.keyword_from, field('from', $._expression))),
    optional(seq($.keyword_to, field('to', $._expression))),
    optional(seq($.keyword_step, field('step', $._expression))),
  ),

  // Override group_by to add WITH TOTALS (alongside base WITH ROLLUP/CUBE)
  group_by: $ => prec.left(seq(
    $.keyword_group,
    $.keyword_by,
    comma_list(choice(
      $._expression,
      $.rollup_clause,
      $.cube_clause,
      $.grouping_sets_clause,
    ), true),
    optional(seq(
      $.keyword_with,
      choice($.keyword_rollup, $.keyword_cube, $.keyword_totals),
    )),
  )),

  // Override limit to add ClickHouse LIMIT n [, m] [WITH TIES] [BY <expr-list>]
  limit: $ => prec.right(seq(
    $.keyword_limit,
    $.literal,
    optional(seq(',', $.literal)),
    optional(seq($.keyword_with, $.keyword_ties)),
    optional($.offset),
    optional($.limit_by),
  )),

  limit_by: $ => seq(
    $.keyword_by,
    comma_list($._expression, true),
  ),

};
