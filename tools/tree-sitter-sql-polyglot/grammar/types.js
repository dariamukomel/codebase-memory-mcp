import { make_keyword, comma_list, paren_list, wrapped_in_parenthesis } from "./helpers.js";

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
        $.keyword_interval,

        $.keyword_json,
        $.keyword_xml,
        $.keyword_string,

        $.enum,

        field('custom_type', $.object_reference)
      ),
      optional($.array_size_definition)
    ),
  ),

  array_size_definition: $ => prec.left(
    choice(
      seq($.keyword_array, optional($._array_size_definition)),
      repeat1($._array_size_definition),
    ),
  ),

  _array_size_definition: $ => seq(
    '[',
    optional(field('size', alias($._integer, $.literal))),
    ']'
  ),

  smallint: $ => parametric_type($, $.keyword_smallint),
  int: $ => parametric_type($, $.keyword_int),
  bigint: $ => parametric_type($, $.keyword_bigint),

  bit: $ => choice(
      $.keyword_bit,
      seq(
          $.keyword_bit,
          prec(0, parametric_type($, $.keyword_varying, ['precision'])),
      ),
      prec(1, parametric_type($, $.keyword_bit, ['precision'])),
  ),

  binary: $ => parametric_type($, $.keyword_binary, ['precision']),
  varbinary: $ => parametric_type($, $.keyword_varbinary, ['precision']),

  float: $  => parametric_type($, $.keyword_float, ['precision']),

  double: $ => choice(
    make_keyword("float8"),
    parametric_type($, $.keyword_double, ['precision', 'scale']),
    parametric_type($, seq($.keyword_double, $.keyword_precision), ['precision', 'scale']),
    parametric_type($, $.keyword_real, ['precision', 'scale']),
  ),

  decimal: $ => choice(
    parametric_type($, $.keyword_decimal, ['precision']),
    parametric_type($, $.keyword_decimal, ['precision', 'scale']),
  ),
  numeric: $ => choice(
    parametric_type($, $.keyword_numeric, ['precision']),
    parametric_type($, $.keyword_numeric, ['precision', 'scale']),
  ),
  char: $ => parametric_type($, $.keyword_char),
  varchar: $ => parametric_type($, $.keyword_varchar),
  nchar: $ => parametric_type($, $.keyword_nchar),
  nvarchar: $ => parametric_type($, $.keyword_nvarchar),

  _include_time_zone: $ => seq(
    choice($.keyword_with, $.keyword_without),
    $.keyword_time,
    $.keyword_zone,
  ),
  // prec.right greedily attaches the optional "[WITH|WITHOUT] TIME ZONE" tail
  // (TIMESTAMP WITH TIME ZONE stays one timestamp node, per
  // test/corpus/create.txt) instead of reducing the bare type and leaving the
  // tail to a following context. This resolves the trailing-optional
  // shift/reduce statically; several dialects (postgres, trino, snowflake,
  // duckdb, athena, cockroachdb) otherwise need a declared [$.time]/[$.timestamp]
  // GLR self-conflict; mirroring oracle's existing prec.right timestamp
  // override. Inert where no such ambiguity exists (base and most dialects).
  time: $ => prec.right(seq(
    parametric_type($, $.keyword_time),
    optional($._include_time_zone),
  )),
  timestamp: $ => prec.right(seq(
    parametric_type($, $.keyword_timestamp),
    optional($._include_time_zone),
  )),

  enum: $ => seq(
    $.keyword_enum,
    paren_list(field('value', alias($._literal_string, $.literal)), true)
  ),

  array: $ => seq(
    $.keyword_array,
    choice(
      seq(
        "[",
        comma_list($._expression),
        "]"
      ),
      seq(
        "(",
        $._dml_read,
        ")",
      )
    )
  ),

};

function parametric_type($, type, params = ['size']) {
  return prec.right(1,
    choice(
      type,
      seq(
        type,
        wrapped_in_parenthesis(
          seq(
            field(params.shift(), alias($._natural_number, $.literal)),
            ...params.map(p => seq(',', field(p, alias($._natural_number, $.literal)))),
          ),
        ),
      ),
    ),
  )
}
