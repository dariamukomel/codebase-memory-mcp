export default {

  // CREATE [OR REPLACE] PACKAGE [IF NOT EXISTS] name AS ... END [name]
  create_package: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_package,
    optional($._if_not_exists),
    $.object_reference,
    $.package_spec,
  ),

  // CREATE [OR REPLACE] PACKAGE BODY [IF NOT EXISTS] name AS ... END [name]
  create_package_body: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_package,
    $.keyword_body,
    optional($._if_not_exists),
    $.object_reference,
    $.package_spec,
  ),

  // AS/IS ... END [name] body structure
  package_spec: $ => seq(
    choice($.keyword_as, $.keyword_is),
    repeat($.package_item),
    $.keyword_end,
    optional($.identifier),
  ),

  // Each item in a package spec/body ends with ;
  package_item: $ => seq(
    choice(
      $.package_function_decl,
      $.package_procedure_decl,
    ),
    ';',
  ),

  // FUNCTION name(args) RETURN type; declaration (no body)
  package_function_decl: $ => seq(
    $.keyword_function,
    $.object_reference,
    optional($.function_arguments),
    $.keyword_return,
    $._type,
  ),

  // PROCEDURE name(args); declaration
  package_procedure_decl: $ => seq(
    $.keyword_procedure,
    $.object_reference,
    optional($.function_arguments),
  ),

};
