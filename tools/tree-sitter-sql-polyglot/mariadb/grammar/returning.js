import { comma_list } from "../../grammar/helpers.js";

export default {

  // RETURNING col_list; shared by DELETE, INSERT, UPDATE
  returning: $ => seq(
    $.keyword_returning,
    $.select_expression,
  ),

  // Override _delete_statement to add RETURNING
  _delete_statement: $ => seq(
    $.delete,
    alias($._delete_from, $.from),
    optional($.returning),
  ),

  // Override insert to add RETURNING
  insert: $ => seq(
    choice(
      $.keyword_insert,
      $.keyword_replace,
    ),
    optional(
      choice(
        $.keyword_low_priority,
        $.keyword_delayed,
        $.keyword_high_priority,
      ),
    ),
    optional($.keyword_ignore),
    optional($.keyword_into),
    field('target', $.object_reference),
    optional(
      seq(
        $.keyword_as,
        field('alias', $.identifier),
      ),
    ),
    choice(
      $._insert_values,
      $._set_values,
    ),
    optional(
      choice(
        $._on_conflict,
        $._on_duplicate_key_update,
      ),
    ),
    optional($.returning),
  ),

  // Override update to add RETURNING
  update: $ => seq(
    $.keyword_update,
    optional($.keyword_only),
    choice(
      $._mysql_update_statement,
      $._postgres_update_statement,
    ),
    optional($.returning),
  ),

};
