import { paren_list, comma_list } from '../../grammar/helpers.js';

export default {

  // STRUCT('Alice', 30)  or  STRUCT(1 AS x, 2 AS y)
  struct: $ => seq(
    $.keyword_struct,
    paren_list(
      choice(
        seq(field('value', $._expression), $.keyword_as, field('alias', $.identifier)),
        field('value', $._expression),
      ),
      true,
    ),
  ),

  // TIMESTAMP '2025-01-01'  /  DATE '2024-12-31'  etc.
  typed_literal: $ => seq(
    $._type,
    alias($._literal_string, $.literal),
  ),

};
