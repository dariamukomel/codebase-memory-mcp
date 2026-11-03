import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // QUALIFY <window_function_condition>
  qualify: $ => seq($.keyword_qualify, field('predicate', $._expression)),

  // PIVOT ( agg [AS alias] [, …] FOR col IN ( value [AS alias] [, …] ) )
  pivot_clause: $ => seq(
    $.keyword_pivot,
    '(',
    comma_list(seq($.invocation, optional($._alias)), true),
    $.keyword_for,
    $.identifier,
    $.keyword_in,
    paren_list(seq(
      choice(alias($._literal_string, $.literal), alias($._integer, $.literal), $.identifier),
      optional($._alias),
    ), true),
    ')',
  ),

  // UNPIVOT ( value_col FOR name_col IN ( col [, …] ) )
  unpivot_clause: $ => seq(
    $.keyword_unpivot,
    optional(choice(
      seq($.keyword_include, $.keyword_nulls),
      seq($.keyword_exclude, $.keyword_nulls),
    )),
    '(',
    choice($.identifier, paren_list($.identifier, true)),
    $.keyword_for,
    $.identifier,
    $.keyword_in,
    paren_list($.identifier, true),
    ')',
  ),

  // GROUP BY ALL groups by every non-aggregated item in the SELECT list.
  group_by: $ => prec.left(seq(
    $.keyword_group,
    $.keyword_by,
    choice(
      $.keyword_all,
      seq(
        comma_list(choice(
          $._expression,
          $.rollup_clause,
          $.cube_clause,
          $.grouping_sets_clause,
        ), true),
        optional(seq($.keyword_with, choice($.keyword_rollup, $.keyword_cube))),
      ),
    ),
  )),

  // UNNEST(<array>) [WITH OFFSET]
  // The outer alias ([AS alias]) is handled by the relation rule
  unnest: $ => seq(
    $.keyword_unnest,
    wrapped_in_parenthesis($._expression),
    optional(seq($.keyword_with, $.keyword_offset)),
  ),

  // SELECT * EXCEPT (col1, col2) FROM t
  all_fields_except: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    $.keyword_except,
    paren_list($.identifier, true),
  ),

  // SELECT * REPLACE (expr AS col) FROM t
  all_fields_replace: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    $.keyword_replace,
    paren_list(
      seq(field('value', $._expression), $.keyword_as, field('alias', $.identifier)),
      true,
    ),
  ),

};
