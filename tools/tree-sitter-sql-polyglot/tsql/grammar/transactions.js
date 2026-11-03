import { make_keyword } from "../../grammar/helpers.js";

// Non-ISO transaction syntax this dialect accepts. The base grammar is ISO only (START TRANSACTION,
// COMMIT [WORK], ROLLBACK [WORK], savepoints with the SAVEPOINT keyword, comma-separated modes);
// ISO has no BEGIN statement (only BEGIN ATOMIC in trigger bodies), no COMMIT/ROLLBACK TRANSACTION
// and no optional SAVEPOINT. Spread first into `rules` so the dialect's own rules override it.
export default {

  // Statements, plus BEGIN/START TRANSACTION ... COMMIT/ROLLBACK as one block.
  program: $ => seq(
    repeat(
      seq(
        choice(
          $.transaction,
          $.statement,
        ),
        ';',
      ),
    ),
    optional(
      $.statement,
    ),
  ),

  transaction: $ => prec.dynamic(1, seq(
    choice(
      seq(
        $.keyword_begin,
        optional(
          choice(
            $.keyword_transaction,
            $.keyword_work,
          ),
        ),
      ),
      seq(
        $.keyword_start,
        $.keyword_transaction,
        optional(
          seq(
            $.transaction_mode,
            repeat(
              seq(
                optional(','),
                $.transaction_mode,
              ),
            ),
          ),
        ),
      ),
    ),
    optional(';'),
    repeat(
      seq(
        $.statement,
        ';'
      ),
    ),
    choice(
      $._commit,
      $._rollback,
    ),
  )),

  _commit: $ => seq(
    $.keyword_commit,
    optional(
      choice(
        $.keyword_transaction,
        $.keyword_work,
      ),
    ),
    optional($._transaction_chain),
  ),

  _rollback: $ => seq(
    $.keyword_rollback,
    optional(
      choice(
        $.keyword_transaction,
        $.keyword_work,
      ),
    ),
    optional($._transaction_chain),
  ),

  // Standalone COMMIT / ROLLBACK also take the TRANSACTION spelling.
  commit_statement: $ => $._commit,

  rollback_statement: $ => $._rollback,

  // Standalone START TRANSACTION also accepts modes without commas (ISO needs commas).
  start_transaction_statement: $ => seq(
    $.keyword_start,
    $.keyword_transaction,
    optional(
      seq(
        $.transaction_mode,
        repeat(seq(optional(','), $.transaction_mode)),
      ),
    ),
  ),

  release_savepoint_statement: $ => seq(
    $.keyword_release,
    optional($.keyword_savepoint),
    field('name', $.identifier),
  ),

  rollback_to_savepoint_statement: $ => seq(
    $.keyword_rollback,
    optional(
      choice(
        $.keyword_transaction,
        $.keyword_work,
      ),
    ),
    optional($._transaction_chain),
    $.keyword_to,
    optional($.keyword_savepoint),
    field('name', $.identifier),
  ),

  // PostgreSQL-style full mode list: ISOLATION LEVEL ... READ {WRITE|ONLY} [NOT] DEFERRABLE.
  _transaction_mode: $ => seq(
    $.keyword_isolation,
    $.keyword_level,
    choice(
      $.keyword_serializable,
      seq($.keyword_repeatable, $.keyword_read),
      seq($.keyword_read, $.keyword_committed),
      seq($.keyword_read, $.keyword_uncommitted),
    ),
    choice(
      seq($.keyword_read, $.keyword_write),
      seq($.keyword_read, $.keyword_only),
    ),
    optional($.keyword_not),
    $.keyword_deferrable,
  ),

  keyword_snapshot: _ => make_keyword("snapshot"),

};
