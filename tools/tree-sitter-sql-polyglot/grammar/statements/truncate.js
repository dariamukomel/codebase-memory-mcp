// <truncate table statement> ::= TRUNCATE TABLE <target table> [ CONTINUE IDENTITY | RESTART IDENTITY ]
export default {

  _truncate_statement: $ => seq(
    $.keyword_truncate,
    $.keyword_table,
    field('target', $.object_reference),
    optional(choice(
      seq($.keyword_continue, $.keyword_identity),
      seq($.keyword_restart, $.keyword_identity),
    )),
  ),

};
