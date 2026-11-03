import { comma_list } from '../../grammar/helpers.js';

export default {

  create_virtual_table: $ => seq(
    $.keyword_create,
    $.keyword_virtual,
    $.keyword_table,
    optional($._if_not_exists),
    field('name', $.object_reference),
    $.keyword_using,
    field('module', $.identifier),
    optional(seq('(', comma_list($._expression, true), ')')),
  ),

};
