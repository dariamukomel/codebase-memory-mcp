export default {

  _mariadb_optimize_table: $ => seq(
    $.keyword_optimize,
    optional(choice($.keyword_local)),
    $.keyword_table,
    $.object_reference,
    repeat(seq(',', $.object_reference)),
  ),

};
