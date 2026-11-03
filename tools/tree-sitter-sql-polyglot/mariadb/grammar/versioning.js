import { comma_list, paren_list } from "../../grammar/helpers.js";

export default {

  // PERIOD FOR SYSTEM_TIME (start_col, end_col); table-level pseudo-constraint
  period_for_system_time: $ => seq(
    $.keyword_period,
    $.keyword_for,
    $.keyword_system_time,
    '(',
    field('start_col', $.identifier),
    ',',
    field('end_col', $.identifier),
    ')',
  ),

  // Override column_definitions to allow PERIOD FOR SYSTEM_TIME as a constraint entry
  column_definitions: $ => seq(
    '(',
    comma_list(
      choice(
        $.column_definition,
        $.constraint,
        $.period_for_system_time,
      ),
      true,
    ),
    ')',
  ),

  // Override create_table to allow OR REPLACE and WITH SYSTEM VERSIONING.
  create_table: $ => prec.left(
    seq(
      $.keyword_create,
      optional($._or_replace),
      optional($._temporary),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      seq(
        optional($.column_definitions),
        repeat($.table_option),
        optional(seq($.keyword_as, $.create_query)),
      ),
      optional(seq($.keyword_with, $.keyword_system, $.keyword_versioning)),
    ),
  ),

};
