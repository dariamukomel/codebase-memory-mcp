import { comma_list, paren_list, optional_parenthesis } from "../../grammar/helpers.js";

export default {

  // Spark 4.0: DECLARE [OR REPLACE] [VARIABLE] var_name [type] [DEFAULT | = expr]
  declare_variable_statement: $ => seq(
    $.keyword_declare,
    optional($._or_replace),
    optional($.keyword_variable),
    field('name', $.identifier),
    optional($._type),
    optional(
      seq(
        choice($.keyword_default, '='),
        $._expression,
      ),
    ),
  ),

  // Spark 4.0: SET VAR var_name = expr | SET VARIABLE var_name = expr
  set_variable_statement: $ => seq(
    $.keyword_set,
    choice($.keyword_var, $.keyword_variable),
    field('name', $.identifier),
    choice('=', $.keyword_to),
    $._expression,
  ),

  // Spark 4.0: LATERAL (subquery) as standalone relation in FROM clause
  // This is distinct from LATERAL JOIN and LATERAL VIEW
  lateral_subquery: $ => seq(
    $.keyword_lateral,
    optional_parenthesis(
      seq(
        $._dml_read,
        optional(seq($.keyword_as, field('alias', $.identifier))),
      ),
    ),
  ),

  // Spark 4.0: SELECT * EXCEPT (col1, col2) FROM t
  // Extends the base all_fields or select_expression
  select_except_clause: $ => seq(
    $.keyword_except,
    paren_list(field('column', $.identifier), true),
  ),

  // Spark 4.0: expr COLLATE collation_name.
  // The left operand is restricted to the expression forms COLLATE actually
  // applies to (a column/field, a string literal, a function result, a
  // parenthesized expression) rather than the full $._expression. Making this a
  // suffix on *every* expression form multiplied the parse table across the
  // whole grammar; this keeps the accepted trees identical (the operand still
  // appears as an unlabeled child) while cutting states in spark AND databricks.
  collate_expression: $ => prec.left(5, seq(
    choice(
      alias($._qualified_field, $.field),
      $.literal,
      $.invocation,
      $.parenthesized_expression,
    ),
    $.keyword_collate,
    field('collation', $.identifier),
  )),

  // Spark 4.0: col:key1:key2  (semi-structured variant path access). The left
  // operand is a column/field, a prior variant path (chaining col:a:b), or a
  // subscript (col[0]:a); not the full $._expression. Same rationale as
  // collate_expression: avoids a bare-`:` suffix on every expression form
  // (which also collides with subscript slice `a[1:2]`), shrinking the table.
  variant_path_expression: $ => prec.left(10, seq(
    choice(
      alias($._qualified_field, $.field),
      $.variant_path_expression,
      $.subscript,
    ),
    ':',
    $.identifier,
  )),

};
