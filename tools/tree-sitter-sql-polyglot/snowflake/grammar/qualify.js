export default {

  // QUALIFY window_expr; post-window filter (Snowflake extension to SELECT)
  qualify: $ => seq(
    $.keyword_qualify,
    field('predicate', $._expression),
  ),

};
