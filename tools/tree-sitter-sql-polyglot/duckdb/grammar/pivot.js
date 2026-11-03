import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // PIVOT tbl ON col [IN (...)] USING agg() [GROUP BY ...] [AS alias]
  pivot_statement: $ => seq(
    $.keyword_pivot,
    $.object_reference,
    $.keyword_on,
    comma_list(field('pivot_col', $._expression), true),
    optional(seq(
      $.keyword_in,
      paren_list($._expression, true),
    )),
    $.keyword_using,
    comma_list(field('agg', $.invocation), true),
    optional(seq(
      $.keyword_group,
      $.keyword_by,
      comma_list($._expression, true),
    )),
    optional(seq(
      $.keyword_as,
      field('alias', $.identifier),
    )),
  ),

  // UNPIVOT tbl ON (cols) INTO NAME n VALUE v [AS alias]
  unpivot_statement: $ => seq(
    $.keyword_unpivot,
    $.object_reference,
    $.keyword_on,
    choice(
      paren_list(field('col', $.identifier), true),
      comma_list(
        seq(
          '(',
          comma_list(field('col', $.identifier), true),
          ')',
        ),
        true,
      ),
    ),
    $.keyword_into,
    $.keyword_name,
    field('name_col', $.identifier),
    $.keyword_value,
    comma_list(field('value_col', $.identifier), true),
    optional(seq(
      $.keyword_as,
      field('alias', $.identifier),
    )),
  ),

};
