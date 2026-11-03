import { comma_list } from '../../grammar/helpers.js';

export default {

  // SIGNAL SQLSTATE [VALUE] 'code' [SET MESSAGE_TEXT = expr]
  signal_statement: $ => seq(
    $.keyword_signal,
    $.keyword_sqlstate,
    optional($.keyword_value),
    field('sqlstate', alias($._literal_string, $.literal)),
    optional(seq(
      $.keyword_set,
      $.keyword_message_text,
      '=',
      field('message', $._expression),
    )),
  ),

  // RESIGNAL [SQLSTATE [VALUE] 'code' [SET MESSAGE_TEXT = expr]]
  resignal_statement: $ => seq(
    $.keyword_resignal,
    optional(seq(
      $.keyword_sqlstate,
      optional($.keyword_value),
      field('sqlstate', alias($._literal_string, $.literal)),
      optional(seq(
        $.keyword_set,
        $.keyword_message_text,
        '=',
        field('message', $._expression),
      )),
    )),
  ),

  // GET DIAGNOSTICS var = ROW_COUNT | RETURN_STATUS | MORE | DB2_TOKEN
  get_diagnostics_statement: $ => seq(
    $.keyword_get,
    $.keyword_diagnostics,
    comma_list(
      seq(
        field('target', $.identifier),
        '=',
        field('item', $.identifier),
      ),
      true,
    ),
  ),

};
