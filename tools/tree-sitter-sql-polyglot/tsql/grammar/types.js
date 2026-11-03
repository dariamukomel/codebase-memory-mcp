import { wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // Override _type to include T-SQL-specific types before the custom_type fallback.
  // All base type alternatives are preserved.
  _type: $ => prec.left(
    seq(
      choice(
        // T-SQL-specific types
        $.datetime2,
        $.smalldatetime,
        $.money_type,
        $.uniqueidentifier,
        // Base types (unchanged)
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
        field('custom_type', $.object_reference),
      ),
      optional($.array_size_definition),
    ),
  ),

  // DATETIME2 [ ( fractional_seconds_precision ) ]
  datetime2: $ => prec.right(1,
    choice(
      $.keyword_datetime2,
      seq($.keyword_datetime2, wrapped_in_parenthesis(alias($._natural_number, $.literal))),
    ),
  ),

  // SMALLDATETIME; no precision parameter
  smalldatetime: $ => $.keyword_smalldatetime,

  // MONEY | SMALLMONEY
  money_type: $ => choice(
    $.keyword_money,
    $.keyword_smallmoney,
  ),

  // UNIQUEIDENTIFIER
  uniqueidentifier: $ => $.keyword_uniqueidentifier,

};
