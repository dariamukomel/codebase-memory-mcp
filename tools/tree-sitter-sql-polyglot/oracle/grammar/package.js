import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // CREATE [OR REPLACE] PACKAGE [EDITIONABLE|NONEDITIONABLE] name
  //   [AUTHID {CURRENT_USER|DEFINER}]
  // {IS|AS}
  //   spec_items
  // END [name];
  create_package: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_package,
    optional(choice($.keyword_editionable, $.keyword_noneditionable)),
    field('name', $.object_reference),
    optional(seq(
      $.keyword_authid,
      choice($.keyword_current_user, $.keyword_definer),
    )),
    choice($.keyword_is, $.keyword_as),
    repeat($._package_spec_item),
    $.keyword_end,
    optional(field('end_name', $.identifier)),
  ),

  // CREATE [OR REPLACE] PACKAGE BODY name {IS|AS}
  //   body_items
  // END [name];
  create_package_body: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_package,
    $.keyword_body,
    field('name', $.object_reference),
    choice($.keyword_is, $.keyword_as),
    repeat($._package_body_item),
    $.keyword_end,
    optional(field('end_name', $.identifier)),
  ),

  // DROP PACKAGE [BODY] name;
  drop_package: $ => seq(
    $.keyword_drop,
    $.keyword_package,
    optional($.keyword_body),
    optional($._if_exists),
    $.object_reference,
  ),

  // Package spec items: variable declarations, procedure/function forward
  // declarations, cursor declarations, exception declarations, and pragmas.
  _package_spec_item: $ => choice(
    $.variable_declaration,
    $.cursor_declaration,
    $.package_exception_declaration,
    $.package_subprogram_declaration,
    $.package_pragma,
  ),

  // Package body items may be any spec item plus full subprogram bodies.
  _package_body_item: $ => choice(
    $.variable_declaration,
    $.cursor_declaration,
    $.package_exception_declaration,
    $.package_subprogram_body,
    $.package_pragma,
  ),

  // name EXCEPTION;
  package_exception_declaration: $ => seq(
    field('name', $.identifier),
    $.keyword_exception,
    ';',
  ),

  // PROCEDURE name [(params)]; or FUNCTION name [(params)] RETURN type;
  package_subprogram_declaration: $ => seq(
    choice(
      seq(
        $.keyword_procedure,
        field('name', $.identifier),
        optional(paren_list($.function_argument, true)),
      ),
      seq(
        $.keyword_function,
        field('name', $.identifier),
        optional(paren_list($.function_argument, true)),
        $.keyword_return,
        field('return_type', $._type),
      ),
    ),
    ';',
  ),

  // PROCEDURE name [(params)] IS|AS ... BEGIN ... END [name];
  // FUNCTION name [(params)] RETURN type IS|AS ... BEGIN ... END [name];
  package_subprogram_body: $ => seq(
    choice(
      seq(
        $.keyword_procedure,
        field('name', $.identifier),
        optional(paren_list($.function_argument, true)),
      ),
      seq(
        $.keyword_function,
        field('name', $.identifier),
        optional(paren_list($.function_argument, true)),
        $.keyword_return,
        field('return_type', $._type),
      ),
    ),
    choice($.keyword_is, $.keyword_as),
    repeat($.variable_declaration),
    $.keyword_begin,
    repeat(seq($.statement, ';')),
    optional(seq(
      $.keyword_exception,
      repeat1($.exception_handler),
    )),
    $.keyword_end,
    optional(field('end_name', $.identifier)),
    ';',
  ),

  // PRAGMA name [(args)]; ; most common: PRAGMA EXCEPTION_INIT
  package_pragma: $ => seq(
    $.keyword_pragma,
    $.identifier,
    optional(paren_list($._expression, true)),
    ';',
  ),

};
