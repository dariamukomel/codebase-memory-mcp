import { paren_list, comma_list } from '../../grammar/helpers.js';

export default {

  // PIVOT ( agg_fn(col) FOR col IN ('v1', 'v2') ) ; standard
  // PIVOT ( agg_fn(col) FOR col IN (ANY ORDER BY col) ) ; dynamic pivot
  pivot_clause: $ => seq(
    $.keyword_pivot,
    '(',
    $.invocation,
    $.keyword_for,
    $.identifier,
    $.keyword_in,
    choice(
      $.pivot_in_list,
      $.pivot_in_any,
    ),
    ')',
  ),

  // ('val1', 'val2', ...)
  pivot_in_list: $ => paren_list(
    choice(alias($._literal_string, $.literal), alias($._integer, $.literal)),
    true,
  ),

  // (ANY ORDER BY col [ASC|DESC] [, ...])
  pivot_in_any: $ => seq(
    '(',
    $.keyword_any,
    $.order_by,
    ')',
  ),

  // UNPIVOT [INCLUDE NULLS | EXCLUDE NULLS] (value_col FOR name_col IN (col1, col2))
  unpivot_clause: $ => seq(
    $.keyword_unpivot,
    optional(choice(
      seq($.keyword_include, $.keyword_nulls),
      seq($.keyword_exclude, $.keyword_nulls),
    )),
    '(',
    $.identifier,
    $.keyword_for,
    $.identifier,
    $.keyword_in,
    paren_list($.identifier, true),
    ')',
  ),

};
