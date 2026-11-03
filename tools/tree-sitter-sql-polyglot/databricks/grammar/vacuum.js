import { paren_list } from "../../grammar/helpers.js";

export default {

  _vacuum_table: $ => choice(
    // Delta: VACUUM TABLE name [RETAIN n HOURS] [DRY RUN]
    // explicit keyword_table makes this branch unambiguous
    seq(
      $.keyword_vacuum,
      $.keyword_table,
      $.object_reference,
      optional(seq($.keyword_retain, $.literal, $.keyword_hours)),
      optional(seq($.keyword_dry, $.keyword_run)),
    ),
    // Delta: VACUUM name RETAIN n HOURS [DRY RUN]
    // explicit RETAIN distinguishes from Standard
    seq(
      $.keyword_vacuum,
      $.object_reference,
      $.keyword_retain,
      $.literal,
      $.keyword_hours,
      optional(seq($.keyword_dry, $.keyword_run)),
    ),
    // Delta: VACUUM name DRY RUN
    // explicit DRY RUN distinguishes from Standard
    seq(
      $.keyword_vacuum,
      $.object_reference,
      $.keyword_dry,
      $.keyword_run,
    ),
  ),

};
