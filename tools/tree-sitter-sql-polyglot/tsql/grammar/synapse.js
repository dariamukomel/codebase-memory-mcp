import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE EXTERNAL DATA SOURCE name WITH ( option = value [, ...] )
  create_external_data_source: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_data,
    $.keyword_source,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_with,
    '(',
    comma_list($.with_option, true),
    ')',
  ),

  // CREATE EXTERNAL FILE FORMAT name WITH ( option = value [, ...] )
  create_external_file_format: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_file,
    $.keyword_format,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_with,
    '(',
    comma_list($.with_option, true),
    ')',
  ),

  // CREATE EXTERNAL TABLE name ( col_defs ) WITH ( option = value [, ...] )
  create_external_table: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    $.keyword_with,
    '(',
    comma_list($.with_option, true),
    ')',
  ),

  // COPY INTO table [(col_list)] FROM 'path' [WITH ( option = value [, ...] )]
  copy_into_statement: $ => seq(
    $.keyword_copy,
    $.keyword_into,
    $.object_reference,
    optional(paren_list($.identifier, true)),
    $.keyword_from,
    alias($._literal_string, $.literal),
    optional(seq(
      $.keyword_with,
      '(',
      comma_list($.with_option, true),
      ')',
    )),
  ),

  // CREATE SHORTCUT [IF NOT EXISTS] name IN target_location USING ( option = ... )
  create_shortcut: $ => seq(
    $.keyword_create,
    $.keyword_shortcut,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_in,
    $.object_reference,
    $.keyword_using,
    '(',
    comma_list($.with_option, true),
    ')',
  ),

  // key = value; used in WITH clauses across Synapse DDL
  with_option: $ => seq(
    $.identifier,
    '=',
    choice(
      alias($._literal_string, $.literal),
      alias($._natural_number, $.literal),
      $.distribution,
      $.object_reference,
    ),
  ),

  // DISTRIBUTION = HASH(col) | ROUND_ROBIN | REPLICATE
  distribution: $ => choice(
    seq($.keyword_hash, '(', $.identifier, ')'),
    $.keyword_round_robin,
    $.keyword_replicate,
  ),

  // CREATE TABLE with WITH (...) for Synapse distribution / index options
  table_with_options: $ => seq(
    $.keyword_with,
    '(',
    comma_list($.table_with_option, true),
    ')',
  ),

  table_with_option: $ => choice(
    seq($.keyword_distribution, '=', $.distribution),
    seq($.keyword_clustered, $.keyword_columnstore, $.keyword_index),
    $.keyword_heap,
    seq($.identifier, optional(seq('=', $._expression))),
  ),

};
