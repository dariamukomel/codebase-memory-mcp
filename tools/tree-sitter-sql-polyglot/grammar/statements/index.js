import { optional_parenthesis, wrapped_in_parenthesis } from "../helpers.js";

import create_rules from "./create.js";
import alter_rules from "./alter.js";
import drop_rules from "./drop.js";
import merge_rules from "./merge.js";
import delete_rules from "./delete.js";
import insert_rules from "./insert.js";
import update_rules from "./update.js";
import truncate_rules from "./truncate.js";
import select_rules from "./select.js";
import set_rules from "./set.js";
import grant_rules from "./grant.js";
import call_rules from "./call.js";

export default {

  // Strict ANSI base: no EXPLAIN prefix (EXPLAIN is not ISO SQL). Dialects that
  // support it re-add the prefix in their own statement override.
  statement: $ => seq(
    choice(
      $._ddl_statement,
      $._dml_write,
      optional_parenthesis($._dml_read),
      $._transaction_statement,
      $.declare_cursor_statement,
      $.call_statement,
    ),
  ),

  // ANSI DECLARE CURSOR (ISO E121, Core): DECLARE name [[NO] SCROLL] CURSOR
  // FOR query. Kept minimal; dialects extend with their own options
  // (WITH HOLD, BINARY, INSENSITIVE, …) in their statement overrides.
  declare_cursor_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    optional(seq(optional($.keyword_no), $.keyword_scroll)),
    $.keyword_cursor,
    $.keyword_for,
    $._dml_read,
  ),

  ...create_rules,
  ...alter_rules,
  ...drop_rules,
  ...merge_rules,
  ...delete_rules,
  ...insert_rules,
  ...update_rules,
  ...truncate_rules,
  ...select_rules,
  ...set_rules,
  ...grant_rules,
  ...call_rules,

  _ddl_statement: $ => choice(
    $._create_statement,
    $._alter_statement,
    $._drop_statement,
    $._merge_statement,
    $.set_statement,
    $.grant_statement,
    $.revoke_statement,
  ),

  _dml_write: $ => seq(
    optional($._cte),
    choice(
      $._delete_statement,
      $._insert_statement,
      $._update_statement,
      $._truncate_statement,
    ),
  ),

  _dml_read: $ => seq(
    optional(optional_parenthesis($._cte)),
    optional_parenthesis(
      choice(
        $._select_statement,
        $.set_operation,
      ),
    ),
  ),


};
