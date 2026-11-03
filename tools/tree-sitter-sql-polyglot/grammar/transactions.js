// ISO 9075 transaction statements. Everything here is in the standard (section 17); the
// non-ISO spellings that dialects accept (BEGIN blocks, COMMIT TRANSACTION, optional SAVEPOINT,
// DEFERRABLE / SNAPSHOT modes) live in `vendor_transaction_rules` below, which a dialect opts into.

export default {

  // <transaction mode> ::= <isolation level> | <transaction access mode> | <diagnostics size>
  transaction_mode: $ => choice(
    seq(
      $.keyword_isolation,
      $.keyword_level,
      choice(
        $.keyword_serializable,
        seq($.keyword_repeatable, $.keyword_read),
        seq($.keyword_read, $.keyword_committed),
        seq($.keyword_read, $.keyword_uncommitted),
      ),
    ),
    seq($.keyword_read, $.keyword_only),
    seq($.keyword_read, $.keyword_write),
    $.transaction_diagnostics,
  ),

  // <diagnostics size> ::= DIAGNOSTICS SIZE <number of conditions>
  transaction_diagnostics: $ => seq(
    $.keyword_diagnostics,
    $.keyword_size,
    $.literal,
  ),

  // AND [ NO ] CHAIN
  _transaction_chain: $ => seq(
    $.keyword_and,
    optional($.keyword_no),
    $.keyword_chain,
  ),

  // <start transaction statement> ::= START TRANSACTION [ <transaction mode> [ , ... ] ]
  start_transaction_statement: $ => seq(
    $.keyword_start,
    $.keyword_transaction,
    optional(
      seq(
        $.transaction_mode,
        repeat(seq(',', $.transaction_mode)),
      ),
    ),
  ),

  // <commit statement> ::= COMMIT [ WORK ] [ AND [ NO ] CHAIN ]
  commit_statement: $ => seq(
    $.keyword_commit,
    optional($.keyword_work),
    optional($._transaction_chain),
  ),

  // <rollback statement> ::= ROLLBACK [ WORK ] [ AND [ NO ] CHAIN ] [ <savepoint clause> ]
  rollback_statement: $ => seq(
    $.keyword_rollback,
    optional($.keyword_work),
    optional($._transaction_chain),
  ),

  // <savepoint clause> ::= TO SAVEPOINT <savepoint specifier>
  rollback_to_savepoint_statement: $ => seq(
    $.keyword_rollback,
    optional($.keyword_work),
    optional($._transaction_chain),
    $.keyword_to,
    $.keyword_savepoint,
    field('name', $.identifier),
  ),

  // <savepoint statement> ::= SAVEPOINT <savepoint specifier>
  savepoint_statement: $ => seq(
    $.keyword_savepoint,
    field('name', $.identifier),
  ),

  // <release savepoint statement> ::= RELEASE SAVEPOINT <savepoint specifier>
  release_savepoint_statement: $ => seq(
    $.keyword_release,
    $.keyword_savepoint,
    field('name', $.identifier),
  ),

  _transaction_statement: $ => choice(
    $.commit_statement,
    $.rollback_statement,
    $.start_transaction_statement,
    $.savepoint_statement,
    $.release_savepoint_statement,
    $.rollback_to_savepoint_statement,
  ),

};
