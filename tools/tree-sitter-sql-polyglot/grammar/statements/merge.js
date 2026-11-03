// <merge statement> ::= MERGE INTO <target> [ [ AS ] <correlation> ] USING <table reference> ON <condition>
//   { WHEN MATCHED [ AND <condition> ] THEN { UPDATE SET ... | DELETE }
//   | WHEN NOT MATCHED [ AND <condition> ] THEN INSERT ... } ...
export default {

  _merge_statement: $=> seq(
    $.keyword_merge,
    $.keyword_into,
    field('target', $.object_reference),
    optional($._alias),
    $.keyword_using,
    field('source', choice(
      $.subquery,
      $.object_reference
    )),
    optional($._alias),
    $.keyword_on,
    field('predicate', $._expression),
    repeat1($.when_clause)
  ),

  when_clause: $ => prec.left(choice(
    seq(
      $.keyword_when,
      $.keyword_matched,
      optional(seq($.keyword_and, field('predicate', $._expression))),
      $.keyword_then,
      choice(
        $.keyword_delete,
        seq($.keyword_update, $._set_values),
      ),
    ),
    seq(
      $.keyword_when,
      $.keyword_not,
      $.keyword_matched,
      optional(seq($.keyword_and, field('predicate', $._expression))),
      $.keyword_then,
      $.keyword_insert,
      $._insert_values,
    ),
  )),

};
