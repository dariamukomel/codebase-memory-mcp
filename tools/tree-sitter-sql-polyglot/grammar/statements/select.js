import { comma_list, optional_parenthesis, paren_list, wrapped_in_parenthesis } from "../helpers.js";

// Shared FROM-clause builder. The base grammar instantiates it WITHOUT the
// non-ANSI LIMIT clause (strict ANSI purity); dialects that support LIMIT
// call fromClause($, { limit: true }) from their own `from` override instead
// of re-enumerating the whole clause. Dialects whose engine has no ANSI
// OFFSET…FETCH FIRST paging (LIMIT-only engines) additionally pass
// offsetFetch: false. Dialects with additional clauses (PREWHERE, QUALIFY, …)
// define their own `from` and do not use this builder.
export function fromClause($, { limit = false, offsetFetch = true } = {}) {
  return seq(
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
    ...(limit ? [optional($.limit)] : []),
    ...(offsetFetch ? [optional($.offset_fetch_clause)] : []),
  );
}

// <join type> ::= INNER | { LEFT | RIGHT | FULL } [OUTER]. Inlined (not a rule) so it shares a prefix
// with lateral_join instead of forcing a reduce before JOIN.
const joinType = ($) => choice(
  $.keyword_inner,
  seq(choice($.keyword_left, $.keyword_right, $.keyword_full), optional($.keyword_outer)),
);

export default {

  _cte: $ => seq(
      $.keyword_with,
      optional($.keyword_recursive),
      $.cte,
      repeat(
          seq(
            ',',
            $.cte,
          ),
      ),
  ),

  cte: $ => seq(
    field('name', $.identifier),
    optional(paren_list(field('argument', $.identifier))),
    $.keyword_as,
    optional(
      seq(
        optional($.keyword_not),
        $.keyword_materialized,
      ),
    ),
    wrapped_in_parenthesis(
      field('body', alias(
        choice($._dml_read, $._dml_write),
        $.statement,
      )),
    ),
  ),

  // <query expression body> ::= <query term> | <body> { UNION | EXCEPT } [ALL | DISTINCT] [<corresponding spec>] <query term>
  //                           | <term> INTERSECT [ALL | DISTINCT] [<corresponding spec>] <query primary>
  set_operation: $ => seq(
    field('left', $._select_statement),
    repeat1(
      seq(
        field(
          "operation",
          seq(
            choice($.keyword_union, $.keyword_except, $.keyword_intersect),
            optional(choice($.keyword_all, $.keyword_distinct)),
            optional(seq($.keyword_corresponding, optional(seq($.keyword_by, paren_list($.identifier, true))))),
          ),
        ),
        field('right', $._select_statement),
      ),
    ),
  ),

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
    ),
  ),

  select: $ => seq(
    $.keyword_select,
    seq(
      optional($.keyword_distinct),
      $.select_expression,
    ),
  ),

  select_expression: $ => seq(
    field('projection', $.term),
    repeat(
      seq(
        ',',
        field('projection', $.term),
      ),
    ),
  ),

  term: $ => seq(
    field(
      'value',
      choice(
        $.all_fields,
        $._expression,
      ),
    ),
    optional($._alias),
  ),

  all_fields: $ => seq(
    optional(
      seq(
        $.object_reference,
        '.',
      ),
    ),
    '*',
  ),

  partition_by: $ => seq(
      $.keyword_partition,
      $.keyword_by,
      comma_list($._expression, true),
  ),

  frame_definition: $ => seq(
      choice(
        seq(
          $.keyword_unbounded,
          $.keyword_preceding,
        ),
        seq(
            field('start',
              choice(
                $.identifier,
                $.binary_expression,
                alias($._literal_string, $.literal),
                alias($._integer, $.literal)
              )
            ),
            $.keyword_preceding,
        ),
        $._current_row,
        seq(
            field('end',
              choice(
                $.identifier,
                $.binary_expression,
                alias($._literal_string, $.literal),
                alias($._integer, $.literal)
              )
            ),
            $.keyword_following,
        ),
        seq(
          $.keyword_unbounded,
          $.keyword_following,
        ),
      ),
  ),

  window_frame: $ => seq(
      choice(
          $.keyword_range,
          $.keyword_rows,
          $.keyword_groups,
      ),

      choice(
          seq(
              $.keyword_between,
              $.frame_definition,
              optional(
                seq(
                  $.keyword_and,
                  $.frame_definition,
                )
              )
          ),
          seq(
              $.frame_definition,
          )
      ),
      optional(
          choice(
              $._exclude_current_row,
              $._exclude_group,
              $._exclude_ties,
              $._exclude_no_others,
          ),
      ),
  ),

  window_clause: $ => seq(
      $.keyword_window,
      $.identifier,
      $.keyword_as,
      $.window_specification,
  ),

  window_specification: $ => wrapped_in_parenthesis(
    seq(
      optional($.partition_by),
      optional($.order_by),
      optional($.window_frame),
    ),
  ),

  window_function: $ => seq(
      $.invocation,
      $.keyword_over,
      choice(
          $.identifier,
          $.window_specification,
      ),
  ),

  _alias: $ => seq(
    optional($.keyword_as),
    field('alias', $.identifier),
  ),

  // Strict ANSI base: LIMIT/OFFSET are not ISO SQL; base keeps only the ANSI
  // OFFSET … FETCH form (fromClause without limit). Dialects that support LIMIT
  // override `from` with fromClause($, { limit: true }).
  from: $ => fromClause($),

  relation: $ => prec.right(
    seq(
      choice(
        field('subquery', $.subquery),
        field('function', $.invocation),
        field('table', $.object_reference),
        field('values', wrapped_in_parenthesis($.values)),
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

  // <sample clause> ::= TABLESAMPLE { BERNOULLI | SYSTEM } ( <sample percentage> ) [ REPEATABLE ( <seed> ) ]
  tablesample: $ => seq(
    $.keyword_tablesample,
    choice($.keyword_bernoulli, $.keyword_system),
    '(',
    $._natural_number,
    ')',
    optional(seq($.keyword_repeatable, '(', $._natural_number, ')')),
  ),

  values: $ => seq(
    $.keyword_values,
    $.list,
    optional(
        repeat(
        seq(
          ',',
          $.list,
        ),
      ),
    ),
  ),

  // <qualified join> ::= [<join type>] JOIN <table reference> <join specification>
  // <natural join>   ::= NATURAL [<join type>] JOIN <table factor>
  // <join type>      ::= INNER | { LEFT | RIGHT | FULL } [OUTER]
  join: $ => choice(
    seq(
      optional(joinType($)),
      $.keyword_join,
      field('relation', $.relation),
      optional($.join),
      choice(
        seq($.keyword_on, field('predicate', $._expression)),
        seq($.keyword_using, alias($._column_list, $.list)),
      ),
    ),
    seq(
      $.keyword_natural,
      optional(joinType($)),
      $.keyword_join,
      field('relation', $.relation),
    ),
  ),

  cross_join: $ => prec.right(
    seq(
      $.keyword_cross,
      $.keyword_join,
      field('relation', $.relation),
      optional(
        seq(
          $.keyword_with,
          $.keyword_ordinality,
          optional(
            seq(
              $.keyword_as,
              field('alias', $.identifier),
              paren_list($.identifier),
            )
          )
        )
      )
    )
  ),

  lateral_join: $ => seq(
    optional(
      choice(
        // lateral joins cannot be right!
        $.keyword_left,
        seq($.keyword_left, $.keyword_outer),
        $.keyword_inner,
      ),
    ),
    $.keyword_join,
    $.keyword_lateral,
    field('relation', choice(
      $.invocation,
      $.subquery,
    )),
    optional(
      choice(
        seq(
          $.keyword_as,
          field('alias', $.identifier),
        ),
        field('alias', $.identifier),
      ),
    ),
    $.keyword_on,
    choice(
      $._expression,
      $.keyword_true,
      $.keyword_false,
    ),
  ),

  lateral_cross_join: $ => seq(
    $.keyword_cross,
    $.keyword_join,
    $.keyword_lateral,
    field('relation', choice(
      $.invocation,
      $.subquery,
    )),
    optional(
      choice(
        seq(
          $.keyword_as,
          field('alias', $.identifier),
        ),
        field('alias', $.identifier),
      ),
    ),
  ),

  where: $ => seq(
    $.keyword_where,
    field('predicate', $._expression),
  ),

  // Strict ANSI: only the leading ROLLUP(...)/CUBE(...)/GROUPING SETS(...)
  // forms are ISO/IEC 9075. The trailing "WITH ROLLUP"/"WITH CUBE" modifier
  // is vendor syntax (MySQL has WITH ROLLUP; T-SQL has both) and is added by
  // those dialects' own group_by overrides, not here.
  group_by: $ => prec.left(seq(
    $.keyword_group,
    $.keyword_by,
    comma_list(choice(
      $._expression,
      $.rollup_clause,
      $.cube_clause,
      $.grouping_sets_clause,
    ), true),
  )),

  rollup_clause: $ => seq(
    $.keyword_rollup,
    '(',
    comma_list(choice($._expression, $.rollup_element), true),
    ')',
  ),

  rollup_element: $ => seq(
    '(',
    comma_list($._expression, true),
    ')',
  ),

  cube_clause: $ => seq(
    $.keyword_cube,
    '(',
    comma_list(choice($._expression, $.cube_element), true),
    ')',
  ),

  cube_element: $ => seq(
    '(',
    comma_list($._expression, true),
    ')',
  ),

  grouping_sets_clause: $ => seq(
    $.keyword_grouping,
    $.keyword_sets,
    '(',
    comma_list(choice($.grouping_set, $._expression), true),
    ')',
  ),

  // A non-empty `(a, b)` is read as an expression list; only the empty grouping set `()` is a
  // grouping_set (and wins over the empty list through dynamic precedence), so the result does not
  // depend on rule order.
  grouping_set: $ => prec.dynamic(1, seq('(', ')')),

  having: $ => seq(
    $.keyword_having,
    $._expression,
  ),

  order_by: $ => prec.right(seq(
    $.keyword_order,
    $.keyword_by,
    comma_list($.order_target, true),
  )),

  // <sort specification> ::= <sort key> [ASC | DESC] [NULLS FIRST | NULLS LAST]
  order_target: $ => seq(
    $._expression,
    optional($.direction),
    optional(seq($.keyword_nulls, choice($.keyword_first, $.keyword_last))),
  ),

  // prec.right: after LIMIT n, a following OFFSET binds to the limit clause
  // rather than starting an ANSI OFFSET … ROWS offset_fetch_clause.
  limit: $ => prec.right(seq(
    $.keyword_limit,
    $.literal,
    optional($.offset),
  )),

  offset: $ => seq(
    $.keyword_offset,
    $.literal,
  ),

  // ANSI [OFFSET n {ROW|ROWS}] FETCH {FIRST|NEXT} n {ROW|ROWS} {ONLY|WITH TIES}
  offset_fetch_clause: $ => prec.right(choice(
    seq(
      $.keyword_offset,
      $.literal,
      choice($.keyword_row, $.keyword_rows),
      optional($._fetch_first_clause),
    ),
    $._fetch_first_clause,
  )),

  _fetch_first_clause: $ => seq(
    $.keyword_fetch,
    choice($.keyword_first, $.keyword_next),
    optional($.literal),
    choice($.keyword_row, $.keyword_rows),
    choice($.keyword_only, seq($.keyword_with, $.keyword_ties)),
  ),

};
