import { comma_list } from '../../grammar/helpers.js';

export default {

  // x -> expr  or  (x, y) -> expr
  // prec.right(-1): prefer extending the body expression over reducing lambda
  lambda_expression: $ => prec.right(-1, seq(
    choice(
      field('param', $.identifier),
      seq('(', comma_list(field('param', $.identifier), true), ')'),
    ),
    '->',
    field('body', $._expression),
  )),

};
