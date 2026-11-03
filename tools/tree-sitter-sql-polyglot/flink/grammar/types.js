import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // Override _type to add Flink-specific types
  _type: $ => prec.left(
    seq(
      choice(
        $.keyword_boolean,
        $.bit,
        $.binary,
        $.varbinary,
        $.keyword_bytes,         // BYTES = VARBINARY(INT_MAX)

        $.keyword_tinyint,
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
        $.keyword_string,        // STRING = VARCHAR(INT_MAX)

        $.keyword_date,
        $.time,
        $.timestamp,
        $.timestamp_ltz,         // TIMESTAMP_LTZ(p)
        $.keyword_interval,

        $.keyword_json,
        $.keyword_xml,

        $.row_type,        // ROW<f1 t1, ...> or ROW(f1 t1, ...)
        $.array_type,      // ARRAY<element_type>
        $.map_type,        // MAP<key_type, val_type>
        $.multiset_type,   // MULTISET<element_type>
        $.raw_type,        // RAW('class', 'snapshot')

        $.enum,
        field('custom_type', $.object_reference),
      ),
      optional($.array_size_definition),
    ),
  ),

  // BYTES  (no parameters)
  // keyword_bytes defined in grammar.js keywords
  // keyword_tinyint defined in grammar.js keywords

  // TIMESTAMP_LTZ(p)
  timestamp_ltz: $ => seq(
    $.keyword_timestamp_ltz,
    optional(seq('(', alias($._natural_number, $.literal), ')')),
  ),

  // ROW<f1 type1 [NOT NULL] ['comment'], f2 type2, ...>
  // also ROW(f1 type1, f2 type2)  (parenthesis form)
  row_type: $ => prec.left(seq(
    $.keyword_row,
    choice(
      seq(
        '<',
        comma_list(
          seq(
            field('field_name', $.identifier),
            field('field_type', $._type),
            optional(seq($.keyword_not, $.keyword_null)),
            optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
          ),
          true,
        ),
        '>',
      ),
      seq(
        '(',
        comma_list(
          seq(
            field('field_name', $.identifier),
            field('field_type', $._type),
            optional(seq($.keyword_not, $.keyword_null)),
            optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
          ),
          true,
        ),
        ')',
      ),
    ),
  )),

  // ARRAY<element_type>
  array_type: $ => seq(
    $.keyword_array,
    '<',
    field('element', $._type),
    '>',
  ),

  // MAP<key_type, value_type>
  map_type: $ => seq(
    $.keyword_map,
    '<',
    field('key', $._type),
    ',',
    field('value', $._type),
    '>',
  ),

  // MULTISET<element_type>
  multiset_type: $ => seq(
    $.keyword_multiset,
    '<',
    field('element', $._type),
    '>',
  ),

  // RAW('class_name', 'serialized_snapshot')
  raw_type: $ => seq(
    $.keyword_raw,
    '(',
    field('class', alias($._literal_string, $.literal)),
    ',',
    field('snapshot', alias($._literal_string, $.literal)),
    ')',
  ),

};
