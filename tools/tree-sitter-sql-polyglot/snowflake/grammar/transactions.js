// Snowflake transactions: https://docs.snowflake.com/en/sql-reference/transactions
// BEGIN and START TRANSACTION are synonyms and may be named; COMMIT and ROLLBACK take an optional
// WORK. There are no savepoints and no isolation-level clauses.
export default {

  _transaction_statement: $ => choice(
    $.begin_statement,
    $.start_transaction_statement,
    $.commit_statement,
    $.rollback_statement,
  ),

  begin_statement: $ => seq(
    $.keyword_begin,
    optional(choice($.keyword_transaction, $.keyword_work)),
    optional(seq($.keyword_name, field('name', $.identifier))),
  ),

  start_transaction_statement: $ => seq(
    $.keyword_start,
    $.keyword_transaction,
    optional(seq($.keyword_name, field('name', $.identifier))),
  ),

  commit_statement: $ => seq($.keyword_commit, optional($.keyword_work)),

  rollback_statement: $ => seq($.keyword_rollback, optional($.keyword_work)),

};
