import { comma_list } from '../../grammar/helpers.js';

export default {

  // CALL catalog.system.expire_snapshots('db.t', TIMESTAMP '2023-01-01', 10)
  // CALL catalog.system.rewrite_data_files(table => 'db.t')
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    '(',
    optional(comma_list(
      choice(
        seq(field('name', $.identifier), '=>', $._expression),
        $._expression,
      ),
      true,
    )),
    ')',
  ),

  // ADD/DROP/REPLACE PARTITION FIELD year(col) [WITH col]
  partition_transform: $ => choice(
    seq(
      field('transform', $.identifier),
      '(',
      optional(seq(field('size', $.literal), ',')),
      field('column', $.identifier),
      ')',
    ),
    field('column', $.identifier),
  ),

  // ALTER TABLE t WRITE ORDERED BY col1 DESC, col2
  write_order: $ => seq(
    $.keyword_write,
    $.keyword_ordered,
    $.keyword_by,
    comma_list($.order_target, true),
  ),

};
