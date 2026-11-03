import { comma_list } from '../../grammar/helpers.js';

export default {

  // LATERAL VIEW [OUTER] function(args) alias AS col [, col2, ...]
  lateral_view: $ => seq(
    $.keyword_lateral,
    $.keyword_view,
    optional($.keyword_outer),
    field('function', $.invocation),
    field('alias', $.identifier),
    $.keyword_as,
    comma_list(field('column', $.identifier), true),
  ),

};
