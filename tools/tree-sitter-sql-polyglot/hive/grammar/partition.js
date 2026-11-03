import { paren_list } from '../../grammar/helpers.js';

export default {

  // PARTITION BY / PARTITIONED BY
  table_partition: $ => seq(
    choice(
      seq($.keyword_partition, $.keyword_by, choice($.keyword_range, $.keyword_hash)),
      seq($.keyword_partitioned, $.keyword_by),
      $.keyword_partition,
    ),
    choice(
      paren_list($.identifier),
      $.column_definitions,
      paren_list($._key_value_pair, true),
    ),
  ),

  // ALTER TABLE t ADD [IF NOT EXISTS] PARTITION (key=val) [LOCATION path]
  add_partition: $ => seq(
    $.keyword_add,
    optional($._if_not_exists),
    repeat1(
      seq(
        $.keyword_partition,
        paren_list(
          seq($.identifier, '=', $._expression),
          true,
        ),
        optional(seq($.keyword_location, $._literal_string)),
      ),
    ),
  ),

  // MSCK REPAIR TABLE t [ADD/DROP/SYNC PARTITIONS]
  msck_repair_statement: $ => seq(
    $.keyword_msck,
    $.keyword_repair,
    $.keyword_table,
    field('name', $.object_reference),
    optional(seq(
      choice($.keyword_add, $.keyword_drop, $.keyword_sync),
      $.keyword_partitions,
    )),
  ),

  // SKEWED BY (cols) ON (vals) [STORED AS DIRECTORIES]
  skewed_by: $ => seq(
    $.keyword_skewed,
    $.keyword_by,
    paren_list($.identifier, true),
    $.keyword_on,
    paren_list($._expression, true),
    optional(seq($.keyword_stored, $.keyword_as, $.keyword_directories)),
  ),

};
