export default {

  // MAP(key_type, value_type); DuckDB map type
  map_type: $ => seq(
    $.keyword_map,
    '(',
    field('key_type', $._type),
    ',',
    field('value_type', $._type),
    ')',
  ),

  // STRUCT(field_name type, ...); DuckDB struct type
  struct_type: $ => seq(
    $.keyword_struct,
    '(',
    $._struct_type_fields,
    ')',
  ),

  _struct_type_fields: $ => seq(
    $._struct_type_field,
    repeat(seq(',', $._struct_type_field)),
  ),

  _struct_type_field: $ => seq(
    field('field_name', $.identifier),
    field('field_type', $._type),
  ),

  // Override _type to add map_type and struct_type
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
      $.map_type,
      $.struct_type,
      // DuckDB native types
      $.keyword_hugeint,
      $.keyword_uinteger,
      $.keyword_ubigint,
      $.keyword_usmallint,
      $.keyword_utinyint,
      $.keyword_tinyint,
      $.keyword_blob,
      $.keyword_uuid,
      $.keyword_varint,
      field('custom_type', $.object_reference),
    ),
  ),

};
