import { paren_list } from '../../grammar/helpers.js';

// Snowflake type names the base type system does not list (NUMBER, TEXT, TIMESTAMP_NTZ, VARIANT, ...)
// parse as a custom type, which the base gives no argument list. Snowflake types take
// precision/scale/length arguments, e.g. NUMBER(10, 2), TIMESTAMP_NTZ(9), TEXT(100).
export default {

  _type: $ => prec.left(
    seq(
      choice(
        $.keyword_boolean,
        $.bit,
        $.binary,
        $.varbinary,

        $.smallint,
        $.int,
        $.bigint,
        $.decimal,
        $.numeric,
        $.double,
        $.float,

        $.char,
        $.varchar,
        $.nchar,
        $.nvarchar,

        $.keyword_date,
        $.time,
        $.timestamp,
        // INTERVAL [<field> [(p)] [TO <field> [(p)]]]
        prec.right(1, seq(
          $.keyword_interval,
          optional(seq(
            $.identifier, optional($._interval_precision),
            optional(seq($.keyword_to, $.identifier, optional($._interval_precision))),
          )),
        )),

        $.keyword_json,
        $.keyword_xml,
        seq($.keyword_string, optional(paren_list(alias($._integer, $.literal), true))),

        $.enum,
        // ARRAY, ARRAY(INT), ARRAY(OBJECT(...)): semi-structured and structured arrays
        seq($.keyword_array, optional(paren_list($.type_argument, true))),

        seq(
          field('custom_type', $.object_reference),
          optional(choice(paren_list($.type_argument, true), seq('(', ')'))),
        ),
      ),
      optional($.array_size_definition),
    ),
  ),

  // TIMESTAMP WITH [LOCAL] TIME ZONE | WITHOUT TIME ZONE
  _include_time_zone: $ => seq(
    choice($.keyword_with, $.keyword_without),
    optional($.keyword_local),
    $.keyword_time,
    $.keyword_zone,
  ),

  // Arguments of a parameterised type: NUMBER(10, 2), ARRAY(INT NOT NULL), OBJECT(city VARCHAR, zip NUMBER),
  // MAP(VARCHAR, VARCHAR), VECTOR(FLOAT, 3).
  type_argument: $ => choice(
    alias($._integer, $.literal),
    seq(field('name', $.identifier), $._type, optional(seq($.keyword_not, $.keyword_null))),
    seq($._type, optional(seq($.keyword_not, $.keyword_null))),
  ),

};
