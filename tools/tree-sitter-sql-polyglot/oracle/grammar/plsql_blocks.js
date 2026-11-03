import { comma_list } from '../../grammar/helpers.js';

export default {

  // Anonymous PL/SQL block: [DECLARE ...] BEGIN ... [EXCEPTION ...] END;
  compound_statement: $ => seq(
    optional(seq(
      $.keyword_declare,
      repeat(choice($.variable_declaration, $.cursor_declaration)),
    )),
    $.keyword_begin,
    repeat(seq($.statement, ';')),
    optional(seq(
      $.keyword_exception,
      repeat1($.exception_handler),
    )),
    $.keyword_end,
    optional(field('label', $.identifier)),
  ),

  // Variable / cursor declaration inside DECLARE block
  variable_declaration: $ => seq(
    field('name', $.identifier),
    choice(
      seq(
        $._type,
        optional(seq($.keyword_not, $.keyword_null)),
        optional(seq(choice($.keyword_default, ':='), $._expression)),
        ';',
      ),
      seq(
        field('base', $.object_reference),
        $.type_attribute,
        optional(seq(choice($.keyword_default, ':='), $._expression)),
        ';',
      ),
      seq(
        field('base', $.object_reference),
        $.rowtype_attribute,
        ';',
      ),
    ),
  ),

  // col%TYPE; scalar type anchoring
  type_attribute: $ => seq(
    '%',
    $.keyword_type,
  ),

  // table%ROWTYPE; record type anchoring
  rowtype_attribute: $ => seq(
    '%',
    $.keyword_rowtype,
  ),

  // EXCEPTION handler: WHEN exception_name THEN statements;
  exception_handler: $ => seq(
    $.keyword_when,
    field('exception_name', choice($.identifier, $.keyword_others)),
    $.keyword_then,
    repeat1(seq($.statement, ';')),
  ),

};
