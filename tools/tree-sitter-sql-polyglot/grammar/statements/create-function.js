import { paren_list, wrapped_in_parenthesis } from "../helpers.js";

export default {

  create_function: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_function,
    optional($._if_not_exists),
    $.object_reference,
    choice(
      // Standard form: FUNCTION name(args) RETURNS type [options] body
      seq(
        $.function_arguments,
        optional(seq(
          $.keyword_returns,
          choice(
            $._type,
            seq($.keyword_setof, $._type),
            seq($.keyword_table, $.column_definitions),
            $.keyword_trigger,
          ),
        )),
        repeat(
          choice(
            $.function_language,
            $.function_volatility,
            $.function_leakproof,
            $.function_security,
            $.function_safety,
            $.function_strictness,
            $.function_cost,
            $.function_rows,
            $.function_support,
          ),
        ),
        optional($.function_body),
        repeat(
          choice(
            $.function_language,
            $.function_volatility,
            $.function_leakproof,
            $.function_security,
            $.function_safety,
            $.function_strictness,
            $.function_cost,
            $.function_rows,
            $.function_support,
          ),
        ),
      ),
    ),
  )),

  _argmode: $ => choice(
    $.keyword_in,
    $.keyword_out,
    $.keyword_inout,
    $.keyword_variadic,
    seq($.keyword_in, $.keyword_out),
  ),

  function_argument: $ => seq(
    optional($._argmode),
    optional($.identifier),
    $._type,
    optional(
      seq(
        choice($.keyword_default, '='),
        $.literal,
      ),
    ),
  ),

  function_arguments: $ => paren_list(
    $.function_argument,
    false,
  ),

  // prec.right: without the ';' that used to terminate the bare-RETURN body, the
  // trailing expression is ambiguous against every operator that can continue it
  // (NOT LIKE / NOT IN / NOT BETWEEN / NOT SIMILAR TO …). Shifting is always the
  // right call, since RETURN takes the longest expression, so this resolves statically
  // instead of costing a GLR conflict.
  _function_return: $ => prec.right(seq(
    $.keyword_return,
    $._expression,
  )),

  _function_body_statement: $ => choice(
    $.statement,
    $._function_return,
  ),

  // ANSI SQL ISO/IEC 9075-4 compound statement body
  function_body: $ => choice(
    // Bare `RETURN expr`; no ';' here. The terminator belongs to `program`
    // (`seq(statement, ';')`). Consuming it inside the body made the statement
    // parse in isolation, because `program` also allows one unterminated trailing
    // statement, while making every *following* statement an ERROR:
    //   CREATE FUNCTION f() RETURNS int LANGUAGE sql RETURN 1; SELECT 1;
    // left `program` still expecting the ';' it had already been given.
    $._function_return,
    seq(
      $.keyword_begin,
      $.keyword_atomic,
      repeat1(
        seq(
          $._function_body_statement,
          ';',
        ),
      ),
      $.keyword_end,
    ),
    seq(
      $.keyword_as,
      alias($._single_quote_string, $.literal),
    ),
  ),

  function_language: $ => seq(
    $.keyword_language,
    $.identifier
  ),

  function_volatility: $ => choice(
    $.keyword_immutable,
    $.keyword_stable,
    $.keyword_volatile,
  ),

  function_leakproof: $ => seq(
    optional($.keyword_not),
    $.keyword_leakproof,
  ),

  function_security: $ => seq(
    optional($.keyword_external),
    $.keyword_security,
    choice($.keyword_invoker, $.keyword_definer),
  ),

  function_safety: $ => seq(
    $.keyword_parallel,
    choice(
      $.keyword_safe,
      $.keyword_unsafe,
      $.keyword_restricted,
    ),
  ),

  function_strictness: $ => choice(
    seq(
      choice(
        $.keyword_called,
        seq(
          $.keyword_returns,
          $.keyword_null,
        ),
      ),
      $.keyword_on,
      $.keyword_null,
      $.keyword_input,
    ),
    $.keyword_strict,
  ),

  function_cost: $ => seq(
    $.keyword_cost,
    $._natural_number,
  ),

  function_rows: $ => seq(
    $.keyword_rows,
    $._natural_number,
  ),

  function_support: $ => seq(
    $.keyword_support,
    alias($._literal_string, $.literal),
  ),

};
