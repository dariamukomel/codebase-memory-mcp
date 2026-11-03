import { comma_list } from '../../grammar/helpers.js';

export default {

  // ARRAY(element_type)
  array_type: $ => seq(
    $.keyword_array,
    '(',
    field('element', $._type),
    ')',
  ),

  // MAP(key_type, value_type)
  map_type: $ => seq(
    $.keyword_map,
    '(',
    field('key_type', $._type),
    ',',
    field('value_type', $._type),
    ')',
  ),

  // ROW(field_name type, ...); field names are optional
  row_type: $ => seq(
    $.keyword_row,
    '(',
    comma_list($.row_type_field, true),
    ')',
  ),

  row_type_field: $ => seq(
    optional(field('field_name', $.identifier)),
    field('field_type', $._type),
  ),

  // Override _type to add parametric types and Trino native types
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
      $.array_type,
      $.map_type,
      $.row_type,
      // Trino native types
      $.keyword_tinyint,
      $.keyword_ipaddress,
      $.keyword_uuid,
      field('custom_type', $.object_reference),
    ),
  ),

};
