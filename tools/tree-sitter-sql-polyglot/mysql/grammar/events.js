export default {

  create_event: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional(seq($.keyword_definer, '=', $.identifier)),
    $.keyword_event,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_on,
    $.keyword_schedule,
    $._event_schedule,
    optional(seq(
      $.keyword_on,
      $.keyword_completion,
      optional($.keyword_not),
      $.keyword_preserve,
    )),
    optional(choice(
      $.keyword_enable,
      seq($.keyword_disable, optional(seq($.keyword_on, $.keyword_slave))),
    )),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    $.keyword_do,
    choice($._dml_read, $._dml_write),
  ),

  _event_schedule: $ => choice(
    seq($.keyword_at, $._expression),
    seq(
      $.keyword_every,
      $._expression,
      $.identifier,
      optional(seq($.keyword_starts, $._expression)),
      optional(seq($.keyword_ends, $._expression)),
    ),
  ),

};
