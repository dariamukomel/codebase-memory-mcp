import { comma_list } from "../../grammar/helpers.js";

export default {

  // CALL proc_name(arg1, arg2, name => val, ...)
  call_statement: $ => seq(
    $.keyword_call,
    $.object_reference,
    '(',
    optional(comma_list(
      choice(
        seq($.identifier, '=>', $._expression),
        $._expression,
      ),
      true,
    )),
    ')',
  ),

  // EXECUTE IMMEDIATE expr [INTO var [, ...]] [USING expr [, ...]]
  execute_immediate_statement: $ => seq(
    $.keyword_execute,
    $.keyword_immediate,
    $._expression,
    optional(seq(
      $.keyword_into,
      comma_list($.identifier, true),
    )),
    optional(seq(
      $.keyword_using,
      comma_list($._expression, true),
    )),
  ),

};
