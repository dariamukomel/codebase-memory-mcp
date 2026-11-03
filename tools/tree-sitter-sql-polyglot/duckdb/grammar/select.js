import { comma_list, wrapped_in_parenthesis, optional_parenthesis, paren_list, make_keyword } from '../../grammar/helpers.js';

export default {

  // DuckDB: SELECT DISTINCT ON (expr, …) … (PostgreSQL-compatible). An explicit
  // rule is required now that the strict ANSI base reserves ON; DISTINCT ON no
  // longer falls back to an accidental on(…) function-call parse.
  select: $ => seq(
    $.keyword_select,
    optional(
      seq(
        $.keyword_distinct,
        optional(seq($.keyword_on, paren_list($._expression, true))),
      ),
    ),
    $.select_expression,
  ),

  // QUALIFY expr
  qualify: $ => seq(
    $.keyword_qualify,
    $._expression,
  ),

  // Set operations with the DuckDB `BY NAME` modifier, which matches columns by
  // name rather than by position: `SELECT … UNION ALL BY NAME SELECT …`.
  set_operation: $ => seq(
    $._select_statement,
    repeat1(seq(
      field('operation', choice(
        seq($.keyword_union, optional(choice($.keyword_all, $.keyword_distinct)), optional($._by_name)),
        seq($.keyword_except, optional($.keyword_all), optional($._by_name)),
        seq($.keyword_intersect, optional($.keyword_all), optional($._by_name)),
      )),
      $._select_statement,
    )),
  ),

  _by_name: $ => seq($.keyword_by, $.keyword_name),

  // * EXCLUDE (col1, col2)
  all_fields_exclude: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    $.keyword_exclude,
    choice(
      field('col', $.identifier),
      seq('(', comma_list(field('col', $.identifier), true), ')'),
    ),
  ),

  // * REPLACE (expr AS col, ...)
  all_fields_replace: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    $.keyword_replace,
    '(',
    comma_list(
      seq(field('value', $._expression), $.keyword_as, field('col', $.identifier)),
      true,
    ),
    ')',
  ),

  // * RENAME (col AS new_col, ...)
  all_fields_rename: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    $.keyword_rename,
    '(',
    comma_list(
      seq(field('old_col', $.identifier), $.keyword_as, field('new_col', $.identifier)),
      true,
    ),
    ')',
  ),

  // Override term to add * EXCLUDE / * REPLACE / * RENAME variants
  term: $ => seq(
    field(
      'value',
      choice(
        $.all_fields_exclude,
        $.all_fields_replace,
        $.all_fields_rename,
        $.all_fields,
        $._expression,
      ),
    ),
    optional($._alias),
  ),

  // Override from to add QUALIFY
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
        $.asof_join,
        $.positional_join,
      ),
    ),
    optional($.using_sample),
    optional($.where),
    optional($.group_by),
    optional($.having),
    optional($.qualify),
    optional($.window_clause),
    optional($.order_by),
    optional($.limit),
    optional($.offset_fetch_clause),
  ),

  // USING SAMPLE n [%|ROWS|PERCENT] | USING SAMPLE method(n [%])
  using_sample: $ => seq(
    $.keyword_using,
    $.keyword_sample,
    choice(
      $.invocation,
      seq(
        alias($._integer, $.literal),
        optional(choice('%', $.keyword_percent, $.keyword_rows)),
      ),
    ),
  ),

  keyword_sample: _ => token(prec(1, make_keyword("sample"))),

  // FROM-first syntax: FROM t [WHERE ...] [SELECT ...]
  from_first_select: $ => seq(
    $.keyword_from,
    optional($.keyword_only),
    comma_list(field('relation', $.relation), true),
    repeat(
      choice(
        $.join,
        $.cross_join,
        $.lateral_join,
        $.lateral_cross_join,
        $.asof_join,
        $.positional_join,
      ),
    ),
    optional($.using_sample),
    optional($.where),
    optional($.group_by),
    optional($.having),
    optional($.qualify),
    optional($.window_clause),
    optional($.order_by),
    optional($.limit),
    optional(seq(
      $.keyword_select,
      optional($.keyword_distinct),
      $.select_expression,
    )),
  ),

  // ASOF JOIN relation ON predicate
  asof_join: $ => seq(
    $.keyword_asof,
    optional(
      choice(
        $.keyword_left,
        seq($.keyword_left, $.keyword_outer),
      ),
    ),
    $.keyword_join,
    field('relation', $.relation),
    choice(
      seq($.keyword_on, field('predicate', $._expression)),
      seq($.keyword_using, wrapped_in_parenthesis(comma_list($.identifier, true))),
    ),
  ),

  // POSITIONAL JOIN relation
  positional_join: $ => seq(
    $.keyword_positional,
    $.keyword_join,
    field('relation', $.relation),
  ),

  // Override relation to allow bare string literal as a FROM source and file_reader
  // e.g. SELECT * FROM '*.parquet' or SELECT * FROM ['a.parquet','b.parquet']
  relation: $ => prec.right(
    seq(
      choice(
        $.subquery,
        $.file_reader,
        $.invocation,
        $.object_reference,
        alias($._literal_string, $.literal),
      ),
      optional($.tablesample),
      optional(
        seq(
          $._alias,
          optional(alias($._column_list, $.list)),
        ),
      ),
    ),
  ),

  // Override group_by to add GROUP BY ALL
  group_by: $ => prec.left(seq(
    $.keyword_group,
    $.keyword_by,
    choice(
      $.keyword_all,
      comma_list(choice(
        $._expression,
        $.rollup_clause,
        $.cube_clause,
        $.grouping_sets_clause,
      ), true),
    ),
  )),

  // Override order_by to add ORDER BY ALL
  order_by: $ => prec.right(seq(
    $.keyword_order,
    $.keyword_by,
    choice(
      $.keyword_all,
      comma_list($.order_target, true),
    ),
  )),

};
