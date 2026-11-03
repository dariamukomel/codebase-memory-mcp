// <delete statement: searched> ::= DELETE FROM <target table> [ [ AS ] <correlation name> ] [ WHERE <condition> ]
// ONLY and ORDER BY are vendor syntax and live in each dialect's grammar/legacy_statements.js.
export default {

  _delete_statement: $ => seq(
    $.delete,
    alias($._delete_from, $.from),
  ),

  _delete_from: $ => seq(
    $.keyword_from,
    field('target', $.object_reference),
    optional($._alias),
    optional($.where),
  ),

  delete: $ => seq(
    $.keyword_delete,
  ),

};
