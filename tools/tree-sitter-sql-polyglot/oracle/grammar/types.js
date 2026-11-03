import { wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // Override _type to include Oracle-specific types before the custom_type fallback.
  // All base type alternatives are preserved.
  _type: $ => prec.left(
    seq(
      choice(
        // Oracle-specific types
        $.number_type,
        $.varchar2,
        $.nvarchar2,
        $.clob,
        $.nclob,
        $.blob,
        $.bfile,
        $.raw_type,
        $.rowid,
        $.urowid,
        $.long_type,
        $.binary_float,
        $.binary_double,
        $.interval_year_to_month,
        $.interval_day_to_second,
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

  // NUMBER[(precision[, scale])]
  number_type: $ => prec.right(1,
    choice(
      $.keyword_number,
      seq(
        $.keyword_number,
        wrapped_in_parenthesis(
          seq(
            field('precision', alias($._natural_number, $.literal)),
            optional(seq(',', field('scale', alias($._natural_number, $.literal)))),
          ),
        ),
      ),
    ),
  ),

  // VARCHAR2[(n [BYTE|CHAR])]; size optional for PL/SQL parameter/variable contexts
  varchar2: $ => prec.right(1,
    choice(
      $.keyword_varchar2,
      seq(
        $.keyword_varchar2,
        wrapped_in_parenthesis(
          seq(
            field('size', alias($._natural_number, $.literal)),
            optional(choice($.keyword_byte, $.keyword_char)),
          ),
        ),
      ),
    ),
  ),

  // NVARCHAR2[(n)]; size optional for PL/SQL contexts
  nvarchar2: $ => prec.right(1,
    choice(
      $.keyword_nvarchar2,
      seq(
        $.keyword_nvarchar2,
        wrapped_in_parenthesis(field('size', alias($._natural_number, $.literal))),
      ),
    ),
  ),

  clob:  $ => $.keyword_clob,
  nclob: $ => $.keyword_nclob,
  blob:  $ => $.keyword_blob,
  bfile: $ => $.keyword_bfile,

  // RAW(n) | LONG RAW
  raw_type: $ => choice(
    seq(
      $.keyword_raw,
      wrapped_in_parenthesis(field('size', alias($._natural_number, $.literal))),
    ),
    seq($.keyword_long, $.keyword_raw),
  ),

  rowid:  $ => $.keyword_rowid,
  urowid: $ => $.keyword_urowid,

  // LONG (legacy)
  long_type: $ => $.keyword_long,

  binary_float:  $ => $.keyword_binary_float,
  binary_double: $ => $.keyword_binary_double,

  // TIMESTAMP[(p)] [WITH [LOCAL] TIME ZONE]
  timestamp: $ => prec.right(1,
    seq(
      prec.right(1,
        choice(
          $.keyword_timestamp,
          seq(
            $.keyword_timestamp,
            wrapped_in_parenthesis(field('precision', alias($._natural_number, $.literal))),
          ),
        ),
      ),
      optional(seq(
        $.keyword_with,
        optional($.keyword_local),
        $.keyword_time,
        $.keyword_zone,
      )),
    ),
  ),

  // INTERVAL YEAR[(p)] TO MONTH
  interval_year_to_month: $ => seq(
    $.keyword_interval,
    prec.right(1,
      choice(
        $.keyword_year,
        seq(
          $.keyword_year,
          wrapped_in_parenthesis(field('year_precision', alias($._natural_number, $.literal))),
        ),
      ),
    ),
    $.keyword_to,
    $.keyword_month,
  ),

  // INTERVAL DAY[(p)] TO SECOND[(s)]
  interval_day_to_second: $ => seq(
    $.keyword_interval,
    prec.right(1,
      choice(
        $.keyword_day,
        seq(
          $.keyword_day,
          wrapped_in_parenthesis(field('day_precision', alias($._natural_number, $.literal))),
        ),
      ),
    ),
    $.keyword_to,
    prec.right(1,
      choice(
        $.keyword_second,
        seq(
          $.keyword_second,
          wrapped_in_parenthesis(field('fractional_precision', alias($._natural_number, $.literal))),
        ),
      ),
    ),
  ),

  // DATE 'YYYY-MM-DD' and TIMESTAMP 'YYYY-MM-DD HH:MI:SS' Oracle literal forms
  date_literal: $ => seq(
    $.keyword_date,
    alias($._literal_string, $.literal),
  ),

  timestamp_literal: $ => seq(
    $.keyword_timestamp,
    alias($._literal_string, $.literal),
  ),

};
