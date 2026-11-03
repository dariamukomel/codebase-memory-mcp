export default {

  // VACUUM [FULL | SORT ONLY | DELETE ONLY | REINDEX] [table]
  vacuum_statement: $ => prec.left(seq(
    $.keyword_vacuum,
    optional(choice(
      $.keyword_full,
      seq($.keyword_sort, $.keyword_only),
      seq($.keyword_delete, $.keyword_only),
      $.keyword_reindex,
    )),
    optional($.object_reference),
  )),

  // ANALYZE COMPRESSION table
  analyze_compression_statement: $ => seq(
    $.keyword_analyze,
    $.keyword_compression,
    $.object_reference,
  ),

  _optimize_statement: $ => choice(
    $.vacuum_statement,
    $.analyze_compression_statement,
  ),

};
