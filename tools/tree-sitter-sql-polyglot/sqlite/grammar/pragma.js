export default {

  pragma_statement: $ => seq(
    $.keyword_pragma,
    field('name', $.object_reference),
    optional(choice(
      seq('=', field('value', $._expression)),
      seq('(', field('value', $._expression), ')'),
    )),
  ),

};
