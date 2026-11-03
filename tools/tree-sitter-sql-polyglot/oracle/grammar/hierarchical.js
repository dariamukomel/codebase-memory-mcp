export default {

  // CONNECT BY [NOCYCLE] [PRIOR expr = expr | expr = PRIOR expr]
  // Optional START WITH clause
  connect_by_clause: $ => seq(
    optional(seq(
      $.keyword_start,
      $.keyword_with,
      field('start_condition', $._expression),
    )),
    $.keyword_connect,
    $.keyword_by,
    optional($.keyword_nocycle),
    field('condition', $._expression),
  ),

  // ORDER SIBLINGS BY; used instead of ORDER BY in hierarchical queries
  order_siblings_by: $ => seq(
    $.keyword_order,
    $.keyword_siblings,
    $.keyword_by,
    $.order_target,
    repeat(seq(',', $.order_target)),
  ),

};
