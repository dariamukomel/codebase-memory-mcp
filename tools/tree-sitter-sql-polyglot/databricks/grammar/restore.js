export default {

  restore_table_statement: $ => seq(
    $.keyword_restore,
    $.keyword_table,
    $.object_reference,
    $.keyword_to,
    choice(
      seq($.keyword_version, $.keyword_as, $.keyword_of, $.literal),
      seq($.keyword_timestamp, $.keyword_as, $.keyword_of, $._expression),
    ),
  ),

  convert_to_delta_statement: $ => seq(
    $.keyword_convert,
    $.keyword_to,
    $.keyword_delta,
    $.object_reference,
    optional(seq($.keyword_no, $.keyword_statistics)),
  ),

  fsck_repair_statement: $ => seq(
    $.keyword_fsck,
    $.keyword_repair,
    $.keyword_table,
    $.object_reference,
  ),

  reorg_table_statement: $ => seq(
    $.keyword_reorg,
    $.keyword_table,
    $.object_reference,
    optional($.where),
    $.keyword_apply,
    '(',
    $.keyword_purge,
    ')',
  ),

  generate_statement: $ => seq(
    $.keyword_generate,
    $.identifier,
    $.keyword_for,
    $.keyword_table,
    $.object_reference,
  ),

  msck_repair_statement: $ => prec.left(seq(
    $.keyword_msck,
    $.keyword_repair,
    $.keyword_table,
    $.object_reference,
    optional(
      seq(
        choice($.keyword_add, $.keyword_drop, $.keyword_sync),
        $.keyword_partitions,
      )
    ),
  )),

};
