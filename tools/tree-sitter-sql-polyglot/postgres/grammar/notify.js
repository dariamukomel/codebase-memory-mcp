export default {

  // LISTEN channel
  listen_statement: $ => seq(
    $.keyword_listen,
    field('channel', $.identifier),
  ),

  // NOTIFY channel [, 'payload']
  notify_statement: $ => seq(
    $.keyword_notify,
    field('channel', $.identifier),
    optional(seq(',', field('payload', alias($._literal_string, $.literal)))),
  ),

  // UNLISTEN { channel | * }
  unlisten_statement: $ => seq(
    $.keyword_unlisten,
    choice(
      field('channel', $.identifier),
      $.all_fields,
    ),
  ),

};
