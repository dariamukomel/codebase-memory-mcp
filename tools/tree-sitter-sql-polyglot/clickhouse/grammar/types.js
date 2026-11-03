import { comma_list } from '../../grammar/helpers.js';

export default {

  // Map(key_type, value_type)
  map_type: $ => seq(
    $.keyword_map,
    '(',
    field('key_type', $._type),
    ',',
    field('value_type', $._type),
    ')',
  ),

  // Tuple(type, ...) or Tuple(name type, ...)
  tuple_type: $ => seq(
    $.keyword_tuple,
    '(',
    comma_list($.tuple_type_field, true),
    ')',
  ),

  tuple_type_field: $ => seq(
    optional(field('field_name', $.identifier)),
    field('field_type', $._type),
  ),

  // Nested(name type, ...)
  nested_type: $ => seq(
    $.keyword_nested,
    '(',
    comma_list($.nested_type_field, true),
    ')',
  ),

  nested_type_field: $ => seq(
    field('field_name', $.identifier),
    field('field_type', $._type),
  ),

  // LowCardinality(T)
  lowcardinality_type: $ => seq(
    $.keyword_lowcardinality,
    '(',
    field('inner', $._type),
    ')',
  ),

  // Nullable(T)
  nullable_type: $ => seq(
    $.keyword_nullable,
    '(',
    field('inner', $._type),
    ')',
  ),

  // FixedString(N)
  fixedstring_type: $ => seq(
    $.keyword_fixedstring,
    '(',
    field('length', alias($._natural_number, $.literal)),
    ')',
  ),

  // DateTime64(precision [, 'timezone']) / DateTime('timezone')
  datetime_type: $ => choice(
    seq(
      $.keyword_datetime64,
      optional(seq(
        '(',
        field('precision', alias($._natural_number, $.literal)),
        optional(seq(',', field('timezone', alias($._literal_string, $.literal)))),
        ')',
      )),
    ),
    seq(
      $.keyword_datetime,
      optional(seq('(', field('timezone', alias($._literal_string, $.literal)), ')')),
    ),
  ),

  // Array(T); ClickHouse parametric form (distinct from base bracketed array_size)
  array_type: $ => seq(
    $.keyword_array,
    '(',
    field('element', $._type),
    ')',
  ),

  // Override _type to add ClickHouse parametric + native types.
  // Re-enumerates base alternatives, then appends ClickHouse-specific ones.
  _type: $ => prec.left(
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
      // ClickHouse parametric types
      $.map_type,
      $.tuple_type,
      $.nested_type,
      $.lowcardinality_type,
      $.nullable_type,
      $.array_type,
      // ClickHouse native scalar types
      $.keyword_uint8,
      $.keyword_uint16,
      $.keyword_uint32,
      $.keyword_uint64,
      $.keyword_uint128,
      $.keyword_uint256,
      $.keyword_int8,
      $.keyword_int16,
      $.keyword_int32,
      $.keyword_int64,
      $.keyword_int128,
      $.keyword_int256,
      $.keyword_float32,
      $.keyword_float64,
      $.fixedstring_type,
      $.keyword_uuid,
      $.keyword_ipv4,
      $.keyword_ipv6,
      $.keyword_date32,
      $.datetime_type,
      field('custom_type', $.object_reference),
    ),
  ),

};
