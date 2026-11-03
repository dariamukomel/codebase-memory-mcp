import { comma_list } from "../../grammar/helpers.js";

export default {

  drop_extension: $ => seq(
    $.keyword_drop,
    $.keyword_extension,
    optional($._if_exists),
    comma_list($.identifier, true),
    optional(choice($.keyword_cascade, $.keyword_restrict)),
  ),

};
