export default {

  // Semi-structured / variant colon-path access:
  //   col:key            ; top-level key
  //   col:obj.nested     ; dot-delimited sub-path
  //   col:arr[0]         ; array index
  //   col:obj.arr[0]::STRING ; cast (:: cast is handled by base binary_expression)
  //
  // Precedence 10 ensures colon binds tightly to the left-hand field/invocation.
  variant_access: $ => prec.right(10, seq(
    choice(
      alias($._qualified_field, $.field),
      $.invocation,
      $.parenthesized_expression,
    ),
    ':',
    $.identifier,
    repeat(choice(
      seq('.', $.identifier),
      seq('[', $._expression, ']'),
      seq(':', $.identifier),
    )),
  )),

};
