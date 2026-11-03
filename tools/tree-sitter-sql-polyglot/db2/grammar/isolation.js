export default {

  // WITH isolation_level; appended to SELECT
  with_isolation_clause: $ => seq(
    $.keyword_with,
    choice($.keyword_ur, $.keyword_cs, $.keyword_rs, $.keyword_rr),
  ),

  // OPTIMIZE FOR n ROWS
  optimize_for_clause: $ => seq(
    $.keyword_optimize,
    $.keyword_for,
    field('n', $._natural_number),
    $.keyword_rows,
  ),

};
