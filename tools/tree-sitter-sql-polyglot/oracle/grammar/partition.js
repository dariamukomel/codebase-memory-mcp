import { paren_list, comma_list } from '../../grammar/helpers.js';

export default {

  // PARTITION BY RANGE|LIST|HASH (cols)
  // [SUBPARTITION BY HASH|LIST (cols) [SUBPARTITIONS n]]
  // [(partition_def, ...)]
  table_partition_by: $ => seq(
    $.keyword_partition, $.keyword_by,
    choice($.keyword_range, $.keyword_list, $.keyword_hash),
    paren_list($._expression, true),
    optional(seq($.keyword_partitions, alias($._natural_number, $.literal))),
    optional(seq(
      $.keyword_subpartition, $.keyword_by,
      choice($.keyword_hash, $.keyword_list),
      paren_list($._expression, true),
      optional(seq($.keyword_subpartitions, alias($._natural_number, $.literal))),
    )),
    optional(paren_list($.partition_definition, true)),
  ),

  partition_definition: $ => seq(
    $.keyword_partition, optional($.identifier),
    choice(
      seq(
        $.keyword_values, $.keyword_less, $.keyword_than,
        paren_list(choice($._expression, $.keyword_maxvalue), true),
      ),
      seq($.keyword_values, paren_list($._expression, true)),
    ),
    optional(seq($.keyword_subpartitions, alias($._natural_number, $.literal))),
  ),

  // ADD/DROP/TRUNCATE/SPLIT/MERGE/EXCHANGE PARTITION; wired into _alter_specifications
  alter_partition: $ => choice(
    seq(
      $.keyword_add, $.keyword_partition, $.identifier,
      $.keyword_values, $.keyword_less, $.keyword_than,
      paren_list(choice($._expression, $.keyword_maxvalue), true),
    ),
    seq($.keyword_drop, $.keyword_partition, $.identifier),
    seq($.keyword_truncate, $.keyword_partition, $.identifier),
    seq(
      $.keyword_split, $.keyword_partition, $.identifier,
      $.keyword_at, paren_list($._expression, true),
      $.keyword_into, paren_list(seq($.keyword_partition, $.identifier), true),
    ),
    seq(
      $.keyword_merge, $.keyword_partitions,
      comma_list($.identifier, true),
      $.keyword_into, $.keyword_partition, $.identifier,
    ),
    seq(
      $.keyword_exchange, $.keyword_partition, $.identifier,
      $.keyword_with, $.keyword_table, $.object_reference,
    ),
  ),

};
