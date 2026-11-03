import { optional_parenthesis } from '../../grammar/helpers.js';

export default {

  // Override when_clause to allow DELETE WHERE condition after UPDATE SET in Oracle MERGE
  when_clause: $ => prec.left(seq(
    $.keyword_when,
    optional($.keyword_not),
    $.keyword_matched,
    optional(
      seq(
        $.keyword_by,
        choice($.keyword_target, $.keyword_source),
      ),
    ),
    optional(
      seq(
        $.keyword_and,
        optional_parenthesis(field('predicate', $._expression)),
      ),
    ),
    $.keyword_then,
    choice(
      $.keyword_delete,
      seq(
        $.keyword_update,
        $._set_values,
        optional(seq($.keyword_delete, $.keyword_where, field('delete_condition', $._expression))),
      ),
      seq(
        $.keyword_insert,
        $._insert_values,
      ),
    ),
  )),

};
