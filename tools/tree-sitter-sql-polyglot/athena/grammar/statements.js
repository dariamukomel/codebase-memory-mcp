import { comma_list } from '../../grammar/helpers.js';

export default {

  // UNLOAD (select_query) TO 's3://path' WITH (k = v, ...)
  unload_statement: $ => seq(
    $.keyword_unload,
    '(',
    $._dml_read,
    ')',
    $.keyword_to,
    field('path', alias($._literal_string, $.literal)),
    optional($.with_properties),
  ),

  // MSCK REPAIR TABLE table_ref [ADD | DROP | SYNC PARTITIONS]
  msck_repair_statement: $ => seq(
    $.keyword_msck,
    $.keyword_repair,
    $.keyword_table,
    $.object_reference,
    optional(seq(
      choice($.keyword_add, $.keyword_drop, $.keyword_sync),
      $.keyword_partitions,
    )),
  ),

  // SHOW PARTITIONS table_name
  show_partitions_statement: $ => seq(
    $.keyword_show,
    $.keyword_partitions,
    $.object_reference,
  ),

  // SHOW CREATE TABLE|VIEW name
  show_create_statement: $ => seq(
    $.keyword_show,
    $.keyword_create,
    choice($.keyword_table, $.keyword_view),
    $.object_reference,
  ),

};
