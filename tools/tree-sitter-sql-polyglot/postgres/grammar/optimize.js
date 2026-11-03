import { comma_list, paren_list } from "../../grammar/helpers.js";

export default {
  // VACUUM [ ( option [,...] ) ] [ table_and_columns [,...] ]
  // VACUUM [FULL] [FREEZE] [VERBOSE] [ANALYZE] [ table_and_columns [,...] ]
  // Both spellings are documented; the second is the pre-9.0 form kept for
  // compatibility. Everything after VACUUM is optional; a bare VACUUM
  // vacuums every table in the database.
  _vacuum_table: $ => prec.left(seq(
    $.keyword_vacuum,
    optional(choice(
      paren_list($._vacuum_option, true),
      repeat1($._vacuum_legacy_option),
    )),
    optional(comma_list($._vacuum_target, true)),
  )),

  // The option list is open ended and version specific, so a name with an
  // optional scalar argument covers it without enumerating every keyword.
  _vacuum_option: $ => seq(
    field('option', $.identifier),
    // Booleans and AUTO/ON/OFF arrive as literals or identifiers already.
    optional(field('value', choice($.literal, $.identifier))),
  ),

  _vacuum_legacy_option: $ => choice(
    $.keyword_full,
    $.keyword_freeze,
    $.keyword_verbose,
    $.keyword_analyze,
  ),

  // [ ONLY ] table [ * ] [ ( column [,...] ) ]
  _vacuum_target: $ => seq(
    optional($.keyword_only),
    $.object_reference,
    optional('*'),
    optional(paren_list($.field, true)),
  ),
};
