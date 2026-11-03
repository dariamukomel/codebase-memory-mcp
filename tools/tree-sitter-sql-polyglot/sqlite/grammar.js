import base from '../grammar.js';
import { optional_parenthesis, comma_list, paren_list, make_keyword, wrapped_in_parenthesis, canonicalOrder } from '../grammar/helpers.js';
import { fromClause } from '../grammar/statements/select.js';
import sqlite_pragma_rules from './grammar/pragma.js';
import sqlite_attach_rules from './grammar/attach.js';
import sqlite_virtual_table_rules from './grammar/virtual_table.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'sqlite_sql',

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
    [$.field, $._qualified_field],
    [$._column, $._qualified_field],
    [$.object_reference],
    // Local shift/reduce ambiguity shared with like_expression's optional
    // ESCAPE tail; kept in sync with the base grammar's conflicts.
    [$.between_expression, $.binary_expression, $.like_expression],
    // Base transaction/call additions (conflicts do not propagate from the parent; kept in sync with grammar.js).
    [$.transaction, $.start_transaction_statement],
    [$.transaction, $.commit_statement],
    [$.transaction, $.rollback_statement],
    [$._commit, $.commit_statement],
    [$._rollback, $.rollback_statement],
    [$.create_function],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // LIMIT is supported: fromClause with limit re-adds it over the ANSI base.
    // SQLite paging is LIMIT/OFFSET only; no ANSI OFFSET…FETCH FIRST.
    from: $ => fromClause($, { limit: true, offsetFetch: false }),

    // Add SQLite's GLOB and MATCH pattern operators to the base operator table.
    binary_expression: $ => choice(
      ...[
        ['+', 'binary_plus'],
        ['-', 'binary_plus'],
        ['*', 'binary_times'],
        ['/', 'binary_times'],
        ['%', 'binary_times'],
        ['^', 'binary_exp'],
        ['=', 'binary_relation'],
        ['<', 'binary_relation'],
        ['<=', 'binary_relation'],
        ['!=', 'binary_relation'],
        ['>=', 'binary_relation'],
        ['>', 'binary_relation'],
        ['<>', 'binary_relation'],
        [$.op_other, 'binary_other'],
        [$.keyword_is, 'binary_is'],
        [$.is_not, 'binary_is'],
        // LIKE / NOT LIKE are handled exclusively by the inherited
        // like_expression rule (with its optional ESCAPE tail); not
        // duplicated here. See base grammar/expressions.js for why.
        // SQLite's four pattern operators are LIKE (handled by
        // like_expression), GLOB, REGEXP and MATCH. keyword_rlike matches
        // both RLIKE and REGEXP, so REGEXP is covered by that entry.
        // SIMILAR TO is deliberately absent: it is ISO SQL that SQLite does
        // not implement, and every extra operator sharing the
        // pattern_matching precedence multiplies this dialect's parse table
        // (see tools/perf/glr_scan.py on LIKE-family ambiguity).
        [$.keyword_glob, 'pattern_matching'],
        [$.not_glob, 'pattern_matching'],
        [$.keyword_match, 'pattern_matching'],
        [$.not_match, 'pattern_matching'],
        [$.keyword_rlike, 'pattern_matching'],
        [$.not_rlike, 'pattern_matching'],
        [$.distinct_from, 'binary_is'],
        [$.not_distinct_from, 'binary_is'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('left', $._expression),
          field('operator', operator),
          field('right', $._expression)
        ))
      ),
      ...[
        [$.keyword_and, 'clause_connective'],
        [$.keyword_or, 'clause_disjunctive'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('left', $._expression),
          field('operator', operator),
          field('right', $._expression)
        ))
      ),
      ...[
        [$.keyword_in, 'binary_in'],
        [$.not_in, 'binary_in'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('left', $._expression),
          field('operator', operator),
          field('right', choice($.list, $.subquery))
        ))
      ),
    ),

    keyword_glob: _ => token(prec(1, make_keyword("glob"))),
    keyword_match: _ => token(prec(1, make_keyword("match"))),
    not_glob: $ => seq($.keyword_not, $.keyword_glob),
    not_match: $ => seq($.keyword_not, $.keyword_match),

    // GRANT/REVOKE removed: SQLite has no access-control model.
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.end_statement,
    ),

    // END [TRANSACTION]; SQLite's synonym for COMMIT, usable on its own and
    // not only as the terminator of a BEGIN block.
    end_statement: $ => prec(-1, prec.right(seq(
      $.keyword_end,
      optional(choice($.keyword_transaction, $.keyword_work)),
    ))),

    // TRUNCATE removed: SQLite has no TRUNCATE TABLE (DELETE without WHERE instead).
    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
      ),
    ),

    // SQLite has no GROUPING SETS/ROLLUP/CUBE.
    group_by: $ => prec.left(seq(
      $.keyword_group,
      $.keyword_by,
      comma_list($._expression, true),
    )),

    // Extend statement to add SQLite-specific top-level statements
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        $._transaction_statement,
        $.pragma_statement,
        $.attach_statement,
        $.detach_statement,
        $.vacuum_statement,
        $.reindex_statement,
      ),
    ),

    // Extend _create_statement to add CREATE VIRTUAL TABLE.
    // No CREATE MATERIALIZED VIEW: SQLite has no materialized views.
    _create_statement: $ => seq(
      choice(
        $.create_table,
        $.create_view,
        $.create_index,
        $.create_function,
        $.create_procedure,
        $.create_type,
        $.create_database,
        $.create_role,
        $.create_sequence,
        $.create_trigger,
        $.create_virtual_table,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    // SQLite trigger with a BEGIN … END statement-list body (base mandates the
    // Postgres EXECUTE FUNCTION tail instead).
    create_trigger: $ => seq(
      $.keyword_create,
      optional($._temporary),
      $.keyword_trigger,
      optional($._if_not_exists),
      field('target', $.object_reference),
      optional(choice(
        $.keyword_before,
        $.keyword_after,
        seq($.keyword_instead, $.keyword_of),
      )),
      $._create_trigger_event,
      $.keyword_on,
      $.object_reference,
      optional(seq($.keyword_for, $.keyword_each, $.keyword_row)),
      optional(seq($.keyword_when, $._expression)),
      $.keyword_begin,
      repeat1(seq(choice($._dml_write, $._dml_read), ';')),
      $.keyword_end,
    ),

    // Override create_table to support WITHOUT ROWID and STRICT table options
    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional($._temporary),
        $.keyword_table,
        optional($._if_not_exists),
        field("target", $.object_reference),
        seq(
          optional($.column_definitions),
          optional(seq($.keyword_as, $.create_query)),
        ),
        optional(choice(
          seq($.keyword_without, $.keyword_rowid),
          $.keyword_strict,
          seq($.keyword_without, $.keyword_rowid, ',', $.keyword_strict),
          seq($.keyword_strict, ',', $.keyword_without, $.keyword_rowid),
        )),
      ),
    ),

    // VACUUM [schema] [INTO 'file']
    vacuum_statement: $ => seq(
      $.keyword_vacuum,
      optional(field('schema', $.identifier)),
      optional(seq($.keyword_into, field('path', alias($._literal_string, $.literal)))),
    ),

    // REINDEX [schema.name]
    reindex_statement: $ => seq(
      $.keyword_reindex,
      optional(field('name', $.object_reference)),
    ),

    // Override insert to add: INSERT OR action, ON CONFLICT clause, RETURNING
    insert: $ => seq(
      $.keyword_insert,
      optional(
        seq($.keyword_or, $.conflict_action),
      ),
      optional($.keyword_into),
      field('target', $.object_reference),
      optional(
        seq($.keyword_as, field('alias', $.identifier)),
      ),
      choice(
        $._insert_values,
        $._set_values,
      ),
      optional($._on_conflict),
      optional($.returning),
    ),

    // UPDATE OR {ROLLBACK|ABORT|REPLACE|FAIL|IGNORE}; SQLite's conflict
    // clause, the same set INSERT already accepts.
    update: $ => seq(
      $.keyword_update,
      optional(seq($.keyword_or, $.conflict_action)),
      optional($.keyword_only),
      choice(
        $._mysql_update_statement,
        $._postgres_update_statement,
      ),
    ),

    // BEGIN [DEFERRED | IMMEDIATE | EXCLUSIVE] [TRANSACTION]
    // Only the isolation modes are new; the rest of the inherited body is
    // reproduced verbatim, since an override replaces the parent wholesale.
    transaction: $ => seq(
      choice(
        seq(
          $.keyword_begin,
          optional(choice(
            $.keyword_deferred,
            $.keyword_immediate,
            $.keyword_exclusive,
          )),
          optional(choice($.keyword_transaction, $.keyword_work)),
        ),
        seq(
          $.keyword_start,
          $.keyword_transaction,
          optional(seq(
            $.transaction_mode,
            repeat(seq(optional(','), $.transaction_mode)),
          )),
        ),
      ),
      optional(';'),
      repeat(seq($.statement, ';')),
      choice($._commit, $._rollback),
    ),

    // SQLite (3.35+) supports RETURNING on UPDATE and DELETE too.
    _update_statement: $ => seq(
      $.update,
      optional($.returning),
    ),

    _delete_statement: $ => seq(
      $.delete,
      alias($._delete_from, $.from),
      optional($.returning),
    ),

    // REPLACE INTO t ... is syntactic sugar for INSERT OR REPLACE
    // (already covered by base via keyword_replace → insert, but kept here for clarity)

    // Conflict resolution algorithms used in INSERT OR ...
    conflict_action: $ => choice(
      $.keyword_rollback,
      $.keyword_abort,
      $.keyword_replace,
      $.keyword_fail,
      $.keyword_ignore,
    ),

    // Override _column_constraint to wire AUTOINCREMENT and add CONFLICT clause on UNIQUE/PK
    _column_constraint: $ => prec.left(choice(
      choice($.keyword_null, $._not_null),
      seq(
        $.keyword_references,
        $.object_reference,
        optional(wrapped_in_parenthesis($.identifier)),
        repeat(
          seq(
            $.keyword_on,
            choice($.keyword_delete, $.keyword_update),
            choice(
              seq($.keyword_no, $.keyword_action),
              $.keyword_restrict,
              $.keyword_cascade,
              seq($.keyword_set, choice($.keyword_null, $.keyword_default)),
            ),
          ),
        ),
      ),
      $._default_expression,
      $._primary_key,
      $.keyword_autoincrement,
      $.direction,
      $._column_comment,
      $._check_constraint,
      seq(
        optional(seq($.keyword_generated, $.keyword_always)),
        $.keyword_as,
        wrapped_in_parenthesis($._expression),
        optional(choice($.keyword_stored, $.keyword_virtual)),
      ),
      $.keyword_unique,
    )),

    // Override relation to add INDEXED BY / NOT INDEXED
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.tablesample),
        optional(choice(
          seq($.keyword_indexed, $.keyword_by, field('index', $.identifier)),
          seq($.keyword_not, $.keyword_indexed),
        )),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // SQLite-specific keywords
    keyword_pragma:        _ => token(prec(1, make_keyword("pragma"))),
    keyword_attach:        _ => token(prec(1, make_keyword("attach"))),
    keyword_detach:        _ => token(prec(1, make_keyword("detach"))),
    keyword_rowid:         _ => token(prec(1, make_keyword("rowid"))),
    keyword_reindex:       _ => token(prec(1, make_keyword("reindex"))),
    keyword_indexed:       _ => token(prec(1, make_keyword("indexed"))),
    keyword_autoincrement: _ => token(prec(1, make_keyword("autoincrement"))),
    keyword_rollback:      _ => token(prec(1, make_keyword("rollback"))),
    // BEGIN EXCLUSIVE; follows BEGIN, so it stays extracted.
    keyword_exclusive:     _ => make_keyword("exclusive"),
    keyword_abort:         _ => token(prec(1, make_keyword("abort"))),
    keyword_fail:          _ => token(prec(1, make_keyword("fail"))),
    keyword_strict:        _ => token(prec(1, make_keyword("strict"))),
    keyword_virtual:       _ => token(prec(1, make_keyword("virtual"))),
    keyword_stored:        _ => token(prec(1, make_keyword("stored"))),
    keyword_vacuum:        _ => token(prec(1, make_keyword("vacuum"))),

    ...sqlite_pragma_rules,
    ...sqlite_attach_rules,
    ...sqlite_virtual_table_rules,

  },
}));
