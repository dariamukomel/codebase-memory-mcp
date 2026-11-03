import { comma_list, paren_list } from '../../grammar/helpers.js';

// PostgreSQL maintenance / utility statements.
//
// Syntax follows the PostgreSQL 17 reference verbatim:
//   REINDEX     https://www.postgresql.org/docs/current/sql-reindex.html
//   CLUSTER     https://www.postgresql.org/docs/current/sql-cluster.html
//   CHECKPOINT  https://www.postgresql.org/docs/current/sql-checkpoint.html
//   DISCARD     https://www.postgresql.org/docs/current/sql-discard.html
//   LOAD        https://www.postgresql.org/docs/current/sql-load.html
//   CLOSE       https://www.postgresql.org/docs/current/sql-close.html
//   ABORT       https://www.postgresql.org/docs/current/sql-abort.html
//   MOVE        https://www.postgresql.org/docs/current/sql-move.html
export default {

  // REINDEX [ ( option [, ...] ) ] { INDEX | TABLE | SCHEMA } [ CONCURRENTLY ] name
  // REINDEX [ ( option [, ...] ) ] { DATABASE | SYSTEM } [ CONCURRENTLY ] [ name ]
  reindex_statement: $ => seq(
    $.keyword_reindex,
    optional(paren_list($._reindex_option, true)),
    choice(
      seq(
        choice($.keyword_index, $.keyword_table, $.keyword_schema),
        optional($.keyword_concurrently),
        field('name', $.object_reference),
      ),
      seq(
        choice($.keyword_database, $.keyword_system),
        optional($.keyword_concurrently),
        optional(field('name', $.object_reference)),
      ),
    ),
  ),

  _reindex_option: $ => choice(
    seq($.keyword_concurrently, optional($._boolean_option)),
    seq($.keyword_tablespace, field('tablespace', $.identifier)),
    seq($.keyword_verbose, optional($._boolean_option)),
  ),

  // CLUSTER [ ( option [, ...] ) ] [ table_name [ USING index_name ] ]
  cluster_statement: $ => prec.right(seq(
    $.keyword_cluster,
    optional(paren_list(seq($.keyword_verbose, optional($._boolean_option)), true)),
    optional(seq(
      field('table', $.object_reference),
      optional(seq($.keyword_using, field('index', $.object_reference))),
    )),
  )),

  // CHECKPOINT
  checkpoint_statement: $ => $.keyword_checkpoint,

  // DISCARD { ALL | PLANS | SEQUENCES | TEMPORARY | TEMP }
  discard_statement: $ => seq(
    $.keyword_discard,
    choice(
      $.keyword_all,
      $.keyword_plans,
      $.keyword_sequences,
      $.keyword_temporary,
      $.keyword_temp,
    ),
  ),

  // LOAD 'filename'
  load_statement: $ => seq(
    $.keyword_load,
    field('filename', alias($._literal_string, $.literal)),
  ),

  // CLOSE { name | ALL }
  close_statement: $ => seq(
    $.keyword_close,
    choice(field('name', $.identifier), $.keyword_all),
  ),

  // ABORT [ WORK | TRANSACTION ] [ AND [ NO ] CHAIN ]; synonym for ROLLBACK
  abort_statement: $ => prec.right(seq(
    $.keyword_abort,
    optional(choice($.keyword_work, $.keyword_transaction)),
    optional(seq($.keyword_and, optional($.keyword_no), $.keyword_chain)),
  )),

  // END [WORK | TRANSACTION] [AND [NO] CHAIN]; PostgreSQL's synonym for
  // COMMIT. Negative precedence because END also closes a PL/pgSQL block: at
  // the end of a statement inside a body, closing the body has to win over
  // starting an END statement.
  end_statement: $ => prec(-1, prec.right(seq(
    $.keyword_end,
    optional(choice($.keyword_work, $.keyword_transaction)),
    optional(seq($.keyword_and, optional($.keyword_no), $.keyword_chain)),
  ))),

  // MOVE [ direction ] [ FROM | IN ] cursor_name
  move_statement: $ => seq(
    $.keyword_move,
    optional($._cursor_direction),
    optional(choice($.keyword_from, $.keyword_in)),
    field('cursor', $.identifier),
  ),

  _cursor_direction: $ => choice(
    $.keyword_next,
    $.keyword_prior,
    $.keyword_first,
    $.keyword_last,
    seq($.keyword_absolute, alias($._integer, $.literal)),
    seq($.keyword_relative, alias($._integer, $.literal)),
    alias($._integer, $.literal),
    $.keyword_all,
    seq($.keyword_forward, optional(choice(alias($._integer, $.literal), $.keyword_all))),
    seq($.keyword_backward, optional(choice(alias($._integer, $.literal), $.keyword_all))),
  ),

};
