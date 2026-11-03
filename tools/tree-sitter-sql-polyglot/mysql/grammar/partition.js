import { paren_list, comma_list } from '../../grammar/helpers.js';

export default {

  // PARTITION BY [LINEAR] RANGE|LIST (expr) | HASH (expr) | KEY (cols)
  // [PARTITIONS n]
  // [(partition_def, ...)]
  table_partition_by: $ => seq(
    $.keyword_partition, $.keyword_by,
    optional($.keyword_linear),
    choice(
      seq(choice($.keyword_range, $.keyword_list), paren_list($._expression, true)),
      seq($.keyword_hash, paren_list($._expression, true)),
      seq($.keyword_key, paren_list($.identifier, true)),
    ),
    optional(seq($.keyword_partitions, alias($._natural_number, $.literal))),
    optional(paren_list($.partition_definition, true)),
  ),

  partition_definition: $ => seq(
    $.keyword_partition, $.identifier,
    optional(choice(
      seq(
        $.keyword_values, $.keyword_less, $.keyword_than,
        choice(paren_list($._expression, true), $.keyword_maxvalue),
      ),
      seq($.keyword_values, $.keyword_in, paren_list($._expression, true)),
    )),
  ),

  // ALTER TABLE partition management; wired into _alter_specifications
  alter_partition: $ => choice(
    seq($.keyword_add, $.keyword_partition,
        paren_list($.partition_definition, true)),
    seq($.keyword_drop, $.keyword_partition,
        comma_list($.identifier, true)),
    seq($.keyword_reorganize, $.keyword_partition,
        comma_list($.identifier, true),
        $.keyword_into, paren_list($.partition_definition, true)),
    seq($.keyword_truncate, $.keyword_partition,
        choice($.keyword_all, comma_list($.identifier, true))),
    seq($.keyword_coalesce, $.keyword_partition,
        alias($._natural_number, $.literal)),
    seq($.keyword_rebuild, $.keyword_partition,
        choice($.keyword_all, comma_list($.identifier, true))),
    seq($.keyword_analyze, $.keyword_partition,
        choice($.keyword_all, comma_list($.identifier, true))),
    seq($.keyword_remove, $.keyword_partitioning),
  ),

};
