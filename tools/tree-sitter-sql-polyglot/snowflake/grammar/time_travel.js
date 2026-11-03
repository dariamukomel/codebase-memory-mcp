export default {

  // AT ( TIMESTAMP => expr | OFFSET => expr | STATEMENT => 'id' )
  // BEFORE ( STATEMENT => 'id' )
  time_travel_clause: $ => choice(
    seq($.keyword_at, '(', $.time_travel_spec, ')'),
    seq($.keyword_before, '(', $.time_travel_spec, ')'),
  ),

  time_travel_spec: $ => seq(
    choice(
      $.keyword_timestamp,
      $.keyword_offset,
      $.keyword_statement,
    ),
    '=>',
    $._expression,
  ),

};
