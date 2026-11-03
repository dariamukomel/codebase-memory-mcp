import { make_keyword, comma_list, optional_parenthesis, paren_list } from '../../grammar/helpers.js';

export default {

  // T-SQL: GROUP BY supports trailing WITH ROLLUP / WITH CUBE (deprecated
  // legacy syntax, superseded by GROUPING SETS, but still valid T-SQL).
  group_by: $ => prec.left(seq(
    $.keyword_group,
    $.keyword_by,
    comma_list(choice(
      $._expression,
      $.rollup_clause,
      $.cube_clause,
      $.grouping_sets_clause,
    ), true),
    optional(seq($.keyword_with, choice($.keyword_rollup, $.keyword_cube))),
  )),

  // SELECT [TOP n [PERCENT] [WITH TIES]] [DISTINCT] ...
  select: $ => seq(
    $.keyword_select,
    optional($.top_clause),
    optional($.keyword_distinct),
    $.select_expression,
  ),

  top_clause: $ => seq(
    $.keyword_top,
    choice(
      alias($._natural_number, $.literal),
      seq('(', $._expression, ')'),
    ),
    optional($.keyword_percent),
    optional(seq($.keyword_with, $.keyword_ties)),
  ),

  // Extend FROM to include CROSS/OUTER APPLY and FOR XML / FOR JSON
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
        $.cross_apply,
        $.outer_apply,
      ),
    ),
    optional($.where),
    optional($.group_by),
    optional($.having),
    optional($.window_clause),
    optional($.order_by),
    optional($.limit),
    optional($.offset_fetch_clause),
    optional($.for_clause),
  ),

  // CROSS APPLY <subquery|function> [alias]
  cross_apply: $ => seq(
    $.keyword_cross,
    $.keyword_apply,
    choice($.subquery, $.invocation),
    optional($._alias),
  ),

  // OUTER APPLY <subquery|function> [alias]
  outer_apply: $ => seq(
    $.keyword_outer,
    $.keyword_apply,
    choice($.subquery, $.invocation),
    optional($._alias),
  ),

  // PIVOT (agg_fn(col) FOR pivot_col IN (val [AS alias], ...)) AS alias
  pivot_clause: $ => seq(
    $.keyword_pivot,
    '(',
    $.invocation,
    $.keyword_for,
    field('pivot_col', $.identifier),
    $.keyword_in,
    paren_list(
      seq($._expression, optional(seq($.keyword_as, field('alias', $.identifier)))),
      true,
    ),
    ')',
  ),

  // UNPIVOT (value_col FOR name_col IN (col, ...)) AS alias
  unpivot_clause: $ => seq(
    $.keyword_unpivot,
    '(',
    field('value_col', $.identifier),
    $.keyword_for,
    field('name_col', $.identifier),
    $.keyword_in,
    paren_list($.identifier, true),
    ')',
  ),


  // FOR XML { RAW | AUTO | EXPLICIT | PATH ['(root)'] } [, ...options]
  // FOR JSON { AUTO | PATH ['(root)'] } [, WITHOUT_ARRAY_WRAPPER]
  for_clause: $ => seq(
    $.keyword_for,
    choice(
      seq($.keyword_xml, $.xml_mode),
      seq($.keyword_json, $.json_mode),
    ),
  ),

  xml_mode: $ => seq(
    choice(
      seq(make_keyword("raw"), optional(seq('(', alias($._literal_string, $.literal), ')'))),
      make_keyword("auto"),
      make_keyword("explicit"),
      seq(make_keyword("path"), optional(seq('(', alias($._literal_string, $.literal), ')'))),
    ),
    repeat(seq(',', $.for_xml_option)),
  ),

  for_xml_option: $ => choice(
    seq(make_keyword("elements"), optional(choice(make_keyword("xsinil"), make_keyword("absent")))),
    make_keyword("xmldata"),
    make_keyword("xmlschema"),
    seq(make_keyword("root"), optional(seq('(', alias($._literal_string, $.literal), ')'))),
    make_keyword("type"),
    seq(make_keyword("binary"), make_keyword("base64")),
  ),

  json_mode: $ => seq(
    choice(
      make_keyword("auto"),
      seq(make_keyword("path"), optional(seq('(', alias($._literal_string, $.literal), ')'))),
    ),
    repeat(seq(',', $.for_json_option)),
  ),

  for_json_option: $ => choice(
    seq(make_keyword("root"), optional(seq('(', alias($._literal_string, $.literal), ')'))),
    make_keyword("include_null_values"),
    make_keyword("without_array_wrapper"),
  ),

};
