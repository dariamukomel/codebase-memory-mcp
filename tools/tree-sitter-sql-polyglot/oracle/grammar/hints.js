export default {

  // Oracle optimizer hint: /*+ hint_directive ... */
  // token(prec(1, ...)) wins over marginalia (prec 0) when the lexer is in a
  // state where optimizer_hint is reachable from the grammar (i.e. right after
  // SELECT/INSERT/UPDATE/DELETE). Regular block comments elsewhere remain marginalia.
  optimizer_hint: _ => token(prec(1, /\/\*\+[^*]*\*+(?:[^/*][^*]*\*+)*\//)),

  // Override select to capture hints between SELECT and DISTINCT/select_expression
  select: $ => seq(
    $.keyword_select,
    optional($.optimizer_hint),
    seq(
      optional($.keyword_distinct),
      $.select_expression,
    ),
  ),

};
