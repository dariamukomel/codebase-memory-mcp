import { comma_list, paren_list } from "../../grammar/helpers.js";

export default {

  create_publication: $ => seq(
    $.keyword_create,
    $.keyword_publication,
    $.identifier,
    optional(choice(
      seq($.keyword_for, $.keyword_all, $.keyword_tables),
      seq($.keyword_for, $.keyword_table, comma_list($.object_reference, true)),
    )),
    optional(seq($.keyword_with, paren_list($._key_value_pair, true))),
  ),

  create_subscription: $ => seq(
    $.keyword_create,
    $.keyword_subscription,
    $.identifier,
    $.keyword_connection,
    alias($._literal_string, $.literal),
    $.keyword_publication,
    comma_list($.identifier, true),
    optional(seq($.keyword_with, paren_list($._key_value_pair, true))),
  ),

  alter_publication: $ => seq(
    $.keyword_alter,
    $.keyword_publication,
    $.identifier,
    choice(
      seq($.keyword_add, $.keyword_table, comma_list($.object_reference, true)),
      seq($.keyword_drop, $.keyword_table, comma_list($.object_reference, true)),
      seq($.keyword_set, $.keyword_table, comma_list($.object_reference, true)),
      seq($.keyword_set, paren_list($._key_value_pair, true)),
      seq($.keyword_rename, $.keyword_to, $.identifier),
      seq($.keyword_owner, $.keyword_to, $.identifier),
    ),
  ),

  drop_publication: $ => seq(
    $.keyword_drop,
    $.keyword_publication,
    optional($._if_exists),
    comma_list($.identifier, true),
    optional(choice($.keyword_cascade, $.keyword_restrict)),
  ),

  drop_subscription: $ => seq(
    $.keyword_drop,
    $.keyword_subscription,
    optional($._if_exists),
    comma_list($.identifier, true),
    optional(choice($.keyword_cascade, $.keyword_restrict)),
  ),

};
