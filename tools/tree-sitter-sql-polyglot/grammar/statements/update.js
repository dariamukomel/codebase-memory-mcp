// <update statement: searched> ::= UPDATE <target table> [ [ AS ] <correlation name> ] SET <set clause list> [ WHERE <condition> ]
// Multi-table UPDATE, UPDATE ... FROM and ONLY are vendor syntax and live in each dialect's
// grammar/legacy_statements.js.
export default {

  _update_statement: $ => seq(
    $.update,
  ),

  update: $ => seq(
    $.keyword_update,
    field('target', $.object_reference),
    optional($._alias),
    $._set_values,
    optional($.where),
  ),

};
