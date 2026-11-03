import { comma_list, optional_parenthesis, paren_list } from '../../grammar/helpers.js';

export default {

  // ── OUTPUT clause ────────────────────────────────────────────────────────────

  // prec.right resolves the internal shift/reduce over the trailing
  // optional(paren_list) after INTO <target>: greedily attach the parenthesized
  // column list to the OUTPUT … INTO target (the sensible reading) rather than
  // reducing output_clause early. This replaces the declared [$.output_clause]
  // GLR self-conflict with a static, deterministic resolution.
  output_clause: $ => prec.right(seq(
    $.keyword_output,
    comma_list($.output_column, true),
    optional(seq(
      $.keyword_into,
      choice($.object_reference, $.variable),
      optional(paren_list($.identifier, true)),
    )),
  )),

  // INSERTED.col | DELETED.col | INSERTED.* | DELETED.* | expression
  output_column: $ => prec.left(choice(
    seq(
      choice($.keyword_inserted, $.keyword_deleted),
      '.',
      choice(field('name', $.identifier), '*'),
    ),
    $._expression,
  )),

  // ── INSERT with OUTPUT ───────────────────────────────────────────────────────
  // T-SQL syntax: INSERT [INTO] table [(col_list)] [OUTPUT ...] VALUES (...) | SELECT ...

  insert: $ => seq(
    $.keyword_insert,
    optional($.keyword_into),
    field('target', $.object_reference),
    optional(seq($.keyword_as, field('alias', $.identifier))),
    optional(alias($._column_list, $.list)),
    optional($.output_clause),
    choice(
      seq($.keyword_values, comma_list($.list, true)),
      $._dml_read,
      $._set_values,
    ),
  ),

  // ── UPDATE with OUTPUT ───────────────────────────────────────────────────────
  // T-SQL UPDATE has the same structure as the base _postgres_update_statement;
  // we only override the wrapper to append the optional OUTPUT clause.

  _update_statement: $ => seq(
    $.update,
    optional($.output_clause),
  ),

  // ── DELETE with OUTPUT ───────────────────────────────────────────────────────
  // T-SQL syntax: DELETE [FROM] table [OUTPUT ...] [WHERE cond]
  // We override _delete_from to give it higher prec than SELECT's `from` rule,
  // avoiding GLR ambiguity (both start with keyword_from).
  // WHERE is kept inside _delete_from so plain DELETE...WHERE still works;
  // for DELETE...OUTPUT...WHERE the optional(where) inside _delete_from is
  // skipped (next token is OUTPUT), and the trailing optional(where) picks it up.

  _delete_from: $ => prec.left(1, seq(
    $.keyword_from,
    optional($.keyword_only),
    $.object_reference,
    optional($.where),
    optional($.order_by),
    optional($.limit),
  )),

  _delete_statement: $ => seq(
    $.delete,
    alias($._delete_from, $.from),
    optional($.output_clause),
    optional($.where),
    optional($.order_by),
    optional($.limit),
  ),

  // ── MERGE BY SOURCE / BY TARGET ──────────────────────────────────────────────

  when_clause: $ => prec.left(seq(
    $.keyword_when,
    optional($.keyword_not),
    $.keyword_matched,
    optional(seq(
      $.keyword_by,
      choice($.keyword_source, $.keyword_target),
    )),
    optional(seq(
      $.keyword_and,
      optional_parenthesis(field('predicate', $._expression)),
    )),
    $.keyword_then,
    choice(
      $.keyword_delete,
      seq($.keyword_update, $._set_values),
      seq($.keyword_insert, optional($._insert_values)),
    ),
  )),

  // ── BULK INSERT ──────────────────────────────────────────────────────────────

  bulk_insert_statement: $ => seq(
    $.keyword_bulk,
    $.keyword_insert,
    $.object_reference,
    $.keyword_from,
    alias($._literal_string, $.literal),
    optional(seq(
      $.keyword_with,
      '(',
      comma_list($.bulk_option, true),
      ')',
    )),
  ),

  bulk_option: $ => seq(
    $.identifier,
    optional(seq(
      '=',
      choice(
        alias($._literal_string, $.literal),
        alias($._natural_number, $.literal),
        $.identifier,
      ),
    )),
  ),

};
