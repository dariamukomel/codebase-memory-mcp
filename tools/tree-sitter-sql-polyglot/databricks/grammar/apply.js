import { paren_list, comma_list, optional_parenthesis } from "../../grammar/helpers.js";

export default {

  apply_changes_statement: $ => seq(
    $.keyword_apply,
    $.keyword_changes,
    $.keyword_into,
    optional($.keyword_table),
    $.object_reference,
    $.keyword_from,
    choice($.subquery, $.object_reference),
    optional(choice($.keyword_view, $.keyword_flow)),
    optional(seq(
      $.keyword_keys,
      alias($._column_list, $.list),
    )),
    optional(seq(
      $.keyword_sequence,
      $.keyword_by,
      $.identifier,
    )),
    optional(seq(
      $.keyword_columns,
      choice(
        $.keyword_all,
        alias($._apply_column_mapping_list, $.list),
      ),
    )),
    optional(seq(
      $.keyword_when,
      $.keyword_matched,
      optional(seq(
        $.keyword_and,
        optional_parenthesis($._expression),
      )),
      $.keyword_then,
      choice(
        $.keyword_delete,
        seq($.keyword_update, $.keyword_set, $.assignment_list),
        seq($.keyword_upsert, $.keyword_set, $.assignment_list),
      ),
    )),
    optional(seq(
      $.keyword_when,
      $.keyword_not,
      $.keyword_matched,
      optional(seq(
        $.keyword_and,
        optional_parenthesis($._expression),
      )),
      $.keyword_then,
      $.keyword_insert,
      optional(alias($._column_list, $.list)),
      optional(seq($.keyword_values, $.list)),
    )),
  ),

  // Parenthesized list of column refs and column mappings (for COLUMNS clause)
  _apply_column_mapping_list: $ => seq(
    '(',
    comma_list(choice(alias($._column, $.column), $.column_mapping), true),
    ')',
  ),

  column_mapping: $ => seq(
    field('target', $.identifier),
    $.keyword_as,
    field('source', $._expression),
  ),

};
