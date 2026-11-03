export default {

  attach_statement: $ => seq(
    $.keyword_attach,
    optional($.keyword_database),
    field('path', alias($._literal_string, $.literal)),
    $.keyword_as,
    field('alias', $.identifier),
  ),

  detach_statement: $ => seq(
    $.keyword_detach,
    optional($.keyword_database),
    field('alias', $.identifier),
  ),

};
