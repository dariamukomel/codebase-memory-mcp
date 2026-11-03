import { paren_list } from "../helpers.js";

export default {

  // ISO 9075 <call statement>: CALL routine ( [argument [, ...]] ), where an argument is a value
  // expression or a <named argument> (name => value).
  call_statement: $ => seq(
    $.keyword_call,
    field('name', $.object_reference),
    paren_list(
      choice(
        $.named_argument,
        $._expression,
      ),
    ),
  ),

  named_argument: $ => seq(
    field('name', $.identifier),
    '=>',
    field('value', $._expression),
  ),

};
