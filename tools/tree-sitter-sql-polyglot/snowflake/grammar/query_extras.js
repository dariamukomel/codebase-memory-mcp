import { comma_list, optional_parenthesis, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// Snowflake query and DML clauses beyond ISO: positional columns ($1, t.$2), TOP n, SAMPLE,
// CHANGES, MINUS / BY NAME set operators, DIRECTED / ASOF joins, PIVOT forms, DELETE ... USING,
// session variables (SET / UNSET), TRUNCATE ... ERROR_TABLE.
export default {

  // $1, $name (session variable), ? (bind)
  parameter: _ => /\?|(\$[0-9]+)|(\$[A-Za-z_][A-Za-z0-9_]*)/,

  _qualified_field: $ => seq(
    optional(seq(optional_parenthesis($.object_reference), '.')),
    field('name', choice(
      $.identifier,
      $.parameter,
      // Type and clause keywords that Snowflake does not reserve are valid column names: SELECT date, time FROM t.
      alias(choice(
        $.keyword_date, $.keyword_time, $.keyword_timestamp, $.keyword_array, $.keyword_interval,
        $.keyword_top, $.keyword_identifier,
      ), $.identifier),
    )),
  ),

  // `_qualified_field` already accepts a parameter as its name, so the base's separate
  // `parameter` alternative would only make `POSITION(? IN x)` ambiguous.
  _position_operand: $ => choice(
    $.literal,
    alias($._qualified_field, $.field),
    $.invocation,
    $.cast,
    $.parenthesized_expression,
    $.trim_expression,
  ),

  // RESAMPLE(USING col INCREMENT BY <step> [METADATA_COLUMNS <expr> [AS a], ...] [PARTITION BY cols])
  resample_clause: $ => seq(
    $.keyword_resample,
    '(',
    $.keyword_using,
    field('column', $._expression),
    $.keyword_increment,
    $.keyword_by,
    field('step', $._expression),
    repeat(choice(
      seq($.keyword_metadata_columns, comma_list($.term, true)),
      $.partition_by,
    )),
    ')',
  ),

  // PARTITION BY [EXCLUDING] <expr>, ...   (EXCLUDING: semantic-view window metrics)
  partition_by: $ => seq(
    $.keyword_partition,
    $.keyword_by,
    optional($.keyword_excluding),
    comma_list($._expression, true),
  ),

  // SELECT [ALL | DISTINCT] [TOP n] <list>
  select: $ => seq(
    $.keyword_select,
    optional($.keyword_distinct),
    optional(seq($.keyword_top, alias($._natural_number, $.literal))),
    $.select_expression,
  ),

  // SAMPLE | TABLESAMPLE [ BERNOULLI | ROW | SYSTEM | BLOCK ] ( <p> | <n> ROWS ) [ REPEATABLE | SEED ( <s> ) ]
  tablesample: $ => seq(
    choice($.keyword_sample, $.keyword_tablesample),
    optional(choice($.keyword_bernoulli, $.keyword_row, $.keyword_system, $.keyword_block)),
    '(',
    alias(choice($._natural_number, /\d+\.\d+/), $.literal),
    optional($.keyword_rows),
    ')',
    optional(seq(choice($.keyword_repeatable, $.keyword_seed), '(', alias($._natural_number, $.literal), ')')),
  ),

  // CHANGES ( INFORMATION => { DEFAULT | APPEND_ONLY } ) { AT | BEFORE } ( ... ) [ END ( ... ) ]
  changes_clause: $ => seq(
    $.keyword_changes,
    '(',
    $.keyword_information,
    '=>',
    choice($.keyword_default, $.keyword_append_only),
    ')',
    choice($.keyword_at, $.keyword_before),
    '(',
    $.time_travel_spec,
    ')',
    optional(seq($.keyword_end, '(', $.time_travel_spec, ')')),
  ),

  time_travel_spec: $ => seq(
    choice($.keyword_timestamp, $.keyword_offset, $.keyword_statement, $.keyword_stream),
    '=>',
    $._expression,
  ),

  // PIVOT ( <agg> [AS a] FOR <col> IN ( <values> | ANY [ORDER BY ..] | <subquery> ) [DEFAULT ON NULL ( <expr> )] )
  pivot_clause: $ => seq(
    $.keyword_pivot,
    '(',
    $.invocation,
    optional($._alias),
    $.keyword_for,
    $.identifier,
    $.keyword_in,
    choice(
      $.pivot_in_list,
      $.pivot_in_any,
      wrapped_in_parenthesis($._dml_read),
    ),
    optional(seq($.keyword_default, $.keyword_on, $.keyword_null, '(', $._expression, ')')),
    ')',
  ),

  pivot_in_list: $ => paren_list(
    seq(choice(alias($._literal_string, $.literal), alias($._integer, $.literal)), optional($._alias)),
    true,
  ),

  pivot_in_any: $ => seq('(', $.keyword_any, optional($.order_by), ')'),

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
    paren_list(seq($.identifier, optional($._alias)), true),
    ')',
  ),

  // [NATURAL] [INNER | { LEFT | RIGHT | FULL } [OUTER]] [DIRECTED] JOIN <relation> [ON <cond> | USING (<cols>)]
  join: $ => seq(
    optional($.keyword_natural),
    optional(choice(
      $.keyword_inner,
      seq(choice($.keyword_left, $.keyword_right, $.keyword_full), optional($.keyword_outer)),
    )),
    optional($.keyword_directed),
    $.keyword_join,
    field('relation', $.relation),
    optional(choice(
      seq($.keyword_on, field('predicate', $._expression)),
      seq($.keyword_using, alias($._column_list, $.list)),
    )),
    // FIRST(u) | LAST(u): which side's row a join keeps when matches repeat
    optional(seq(choice($.keyword_first, $.keyword_last), wrapped_in_parenthesis($.identifier))),
  ),

  // ( u RIGHT OUTER JOIN v ON ... ): a parenthesised join used as one side of an outer join
  joined_relation: $ => seq(
    '(',
    field('relation', $.relation),
    repeat1(choice($.join, $.cross_join)),
    ')',
  ),

  cross_join: $ => prec.right(seq(
    $.keyword_cross,
    optional($.keyword_directed),
    $.keyword_join,
    field('relation', $.relation),
  )),

  // ASOF JOIN <relation> MATCH_CONDITION ( <cond> ) [ON <cond> | USING (<cols>)]
  asof_join: $ => seq(
    $.keyword_asof,
    $.keyword_join,
    field('relation', $.relation),
    $.keyword_match_condition,
    '(',
    $._expression,
    ')',
    optional(choice(
      seq($.keyword_on, field('predicate', $._expression)),
      seq($.keyword_using, alias($._column_list, $.list)),
    )),
  ),

  // DELETE FROM <t> [AS a] [USING <relation> [, ...]] [WHERE <cond>]
  _delete_from: $ => seq(
    $.keyword_from,
    field('target', $.object_reference),
    optional($._alias),
    optional(seq($.keyword_using, comma_list(field('source', $.relation), true))),
    optional($.where),
  ),

  // SET <var> = <expr> | SET ( <v1>, ... ) = ( <e1>, ... );  UNSET <var> | ( <v1>, ... )
  set_statement: $ => seq(
    $.keyword_set,
    choice(
      seq($.identifier, '=', $._expression),
      seq(paren_list($.identifier, true), '=', paren_list($._expression, true)),
    ),
  ),

  unset_statement: $ => seq(
    $.keyword_unset,
    choice($.identifier, paren_list($.identifier, true)),
  ),

  // TRUNCATE [TABLE] [IF EXISTS] <t> | ERROR_TABLE ( <t> )
  _truncate_statement: $ => seq(
    $.keyword_truncate,
    optional(choice($.keyword_table, seq($.keyword_materialized, $.keyword_view))),
    optional($._if_exists),
    choice(
      $.object_reference,
      seq($.keyword_error_table, '(', $.object_reference, ')'),
    ),
  ),

  // SELECT * [ILIKE 'pattern'] [EXCLUDE ...] [REPLACE (<expr> AS <col>, ...)] [RENAME ...]
  all_fields_transform: $ => seq(
    optional(seq($.object_reference, '.')),
    '*',
    choice(
      seq($._ilike_pattern, optional($._exclude_columns), optional($._replace_columns), optional($._rename_columns)),
      seq($._exclude_columns, optional($._replace_columns), optional($._rename_columns)),
      seq($._replace_columns, optional($._rename_columns)),
      $._rename_columns,
    ),
  ),

  _replace_columns: $ => seq(
    $.keyword_replace,
    paren_list(seq($._expression, $.keyword_as, field('col', $.identifier)), true),
  ),

  // UNION [ALL | DISTINCT] [BY NAME], EXCEPT / MINUS, INTERSECT
  // A trailing ORDER BY / LIMIT after a parenthesised last operand orders the whole result; after a bare
  // operand it still belongs to that operand (the lower precedence makes the shift win).
  set_operation: $ => prec(-1, seq(
    $._select_statement,
    repeat1(seq(
      field('operation', choice(
        seq($.keyword_union, optional(choice($.keyword_all, $.keyword_distinct)), optional(seq($.keyword_by, $.keyword_name))),
        seq($.keyword_except, optional(choice($.keyword_all, $.keyword_distinct))),
        $.keyword_minus,
        seq($.keyword_intersect, optional(choice($.keyword_all, $.keyword_distinct))),
      )),
      $._select_statement,
    )),
    optional(choice(
      seq($.order_by, optional(choice($.limit, $.offset_fetch_clause))),
      $.limit,
      $.offset_fetch_clause,
    )),
  )),

  // Legacy outer-join marker: t.c1 = u.c2 (+)
  outer_join_marker: $ => seq(alias($._qualified_field, $.field), '(', '+', ')'),

  // CONNECT_BY_ROOT <expr>
  connect_by_root: $ => prec.left('unary_other', seq($.keyword_connect_by_root, $._expression)),

  // START WITH ... CONNECT BY ... may be followed by a WHERE filter
  connect_by_clause: $ => seq(
    optional(seq($.keyword_start, $.keyword_with, $._expression)),
    $.keyword_connect,
    $.keyword_by,
    optional($.keyword_nocycle),
    comma_list($._expression, true),
  ),

  // [OFFSET n [ROW | ROWS]] [FETCH [FIRST | NEXT] n [ROW | ROWS] [ONLY]]
  offset_fetch_clause: $ => prec.right(choice(
    seq($.keyword_offset, $.literal, optional(choice($.keyword_row, $.keyword_rows)), optional($._snowflake_fetch)),
    $._snowflake_fetch,
  )),

  _snowflake_fetch: $ => seq(
    $.keyword_fetch,
    optional(choice($.keyword_first, $.keyword_next)),
    $.literal,
    optional(choice($.keyword_row, $.keyword_rows)),
    optional($.keyword_only),
  ),

  // ORDER BY ALL [ASC | DESC] [NULLS { FIRST | LAST }] | ORDER BY <expr> ...
  order_by: $ => prec.right(seq(
    $.keyword_order,
    $.keyword_by,
    choice(
      seq($.keyword_all, optional($.direction), optional(seq($.keyword_nulls, choice($.keyword_first, $.keyword_last)))),
      comma_list($.order_target, true),
    ),
  )),

};
