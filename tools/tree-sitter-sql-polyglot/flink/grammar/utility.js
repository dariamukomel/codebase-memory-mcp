import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // LOAD MODULE name [WITH ('key'='val',...)]
  load_module: $ => seq(
    $.keyword_load,
    $.keyword_module,
    field('name', $.identifier),
    optional($.with_properties),
  ),

  // UNLOAD MODULE name
  unload_module: $ => seq(
    $.keyword_unload,
    $.keyword_module,
    field('name', $.identifier),
  ),

  // USE MODULES module1 [, module2, ...]
  use_modules_statement: $ => seq(
    $.keyword_use,
    $.keyword_modules,
    comma_list($.identifier, true),
  ),

  // USE CATALOG name
  use_catalog_statement: $ => seq(
    $.keyword_use,
    $.keyword_catalog,
    field('name', $.identifier),
  ),

  // USE [cat.]database  (overrides base use_statement for Flink database context)
  use_database_statement: $ => seq(
    $.keyword_use,
    $.object_reference,
  ),

  // ADD JAR 'uri'
  add_jar: $ => seq(
    $.keyword_add,
    $.keyword_jar,
    field('path', alias($._literal_string, $.literal)),
  ),

  // REMOVE JAR 'uri'
  remove_jar: $ => seq(
    $.keyword_remove,
    $.keyword_jar,
    field('path', alias($._literal_string, $.literal)),
  ),

  // ANALYZE TABLE name [PARTITION (spec)] COMPUTE STATISTICS [FOR COLUMNS cols | FOR ALL COLUMNS]
  analyze_table: $ => seq(
    $.keyword_analyze,
    $.keyword_table,
    $.object_reference,
    optional(seq(
      $.keyword_partition,
      paren_list(seq($.identifier, '=', $.literal), true),
    )),
    $.keyword_compute,
    $.keyword_statistics,
    optional(
      seq(
        $.keyword_for,
        choice(
          seq($.keyword_columns, comma_list($.identifier, true)),
          seq($.keyword_all, $.keyword_columns),
        ),
      ),
    ),
  ),

  // STOP JOB 'job_id' [WITH SAVEPOINT] [WITH DRAIN]
  stop_job: $ => seq(
    $.keyword_stop,
    $.keyword_job,
    field('job_id', alias($._literal_string, $.literal)),
    optional(seq($.keyword_with, $.keyword_savepoint)),
    optional(seq($.keyword_with, $.keyword_drain)),
  ),

  // CALL [[cat.]db.]procedure(args)
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    '(',
    optional(comma_list(
      choice(
        seq($.identifier, '=>', $._expression),
        $._expression,
      ),
      true,
    )),
    ')',
  ),

  // Override set_statement: SET 'key' = 'val' | SET (show all config)
  set_statement: $ => seq(
    $.keyword_set,
    optional(seq(
      alias($._literal_string, $.literal),
      '=',
      alias($._literal_string, $.literal),
    )),
  ),

  // Override reset_statement: RESET ['key']
  reset_statement: $ => seq(
    $.keyword_reset,
    optional(alias($._literal_string, $.literal)),
  ),

};
