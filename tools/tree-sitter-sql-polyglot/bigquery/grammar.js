import base from '../grammar.js';
import { paren_list, comma_list, optional_parenthesis, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';

import select_rules    from './grammar/select.js';
import expr_rules      from './grammar/expressions.js';
import string_rules    from './grammar/strings.js';
import scripting_rules from './grammar/scripting.js';
import ddl_rules       from './grammar/ddl.js';
import ml_rules        from './grammar/ml.js';
import types_rules     from './grammar/types.js';
import objects_rules   from './grammar/objects.js';
import alter_rules     from './grammar/alter.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'bigquery_sql',

  conflicts: $ => [
    // Inherited base conflicts
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
    [$.add_constraint],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
    // BigQuery-specific
    [$.all_fields, $.all_fields_except],
    [$.qualify],
    [$.array_type, $.struct_type],
    [$.unnest],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // ── Program: add scripting top-level blocks ─────────────────────────────
    program: $ => seq(
      repeat(seq(
        choice(
          $.transaction,
          $.statement,
          $.compound_statement,
        ),
        ';',
      )),
      optional($.statement),
    ),

    // ── Statement: add BigQuery scripting statements ────────────────────────
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
        $.declare_statement,
        $.set_variable_statement,
        $.for_statement,
        $.while_statement,
        $.loop_statement,
        $.if_statement,
        $.leave_statement,
        $.continue_statement,
        $.call_statement,
        $.raise_statement,
        $.return_statement,
      ),
    ),

    // ── DML: THEN RETURN; BigQuery's RETURNING equivalent (#117) ───────────
    _insert_statement: $ => seq(
      $.insert,
      optional($.then_return_clause),
    ),

    _update_statement: $ => seq(
      $.update,
      optional($.then_return_clause),
    ),

    _delete_statement: $ => seq(
      $.delete,
      alias($._delete_from, $.from),
      optional($.then_return_clause),
    ),

    then_return_clause: $ => seq(
      $.keyword_then,
      $.keyword_return,
      optional(seq(
        $.keyword_with,
        $.keyword_action,
        optional(seq($.keyword_as, field('alias', $.identifier))),
      )),
      $.select_expression,
    ),

    // ── DDL: add BigQuery-specific statements ───────────────────────────────
    _ddl_statement: $ => choice(
      // base ANSI DDL
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.grant_statement,
      $.revoke_statement,
      // BigQuery additions
      $.export_data,
      $.load_data_statement,
      $.assert_statement,
      $.comment_statement,
      $.create_table_from_source,
      $.create_external_schema,
      $.create_row_access_policy,
      $.drop_row_access_policy,
      $.create_admin_object,
      $.alter_admin_object,
      $.drop_admin_object,
      $.undrop_schema,
      $.alter_schema_replica,
      $.alter_search_index,
      $.drop_search_index,
      $.drop_qualified_table,
      $.drop_all_row_access_policies,
    ),

    // LOAD DATA {INTO|OVERWRITE} table [(cols)] [OPTIONS(…)] FROM FILES (k = v, …)
    load_data_statement: $ => seq(
      $.keyword_load,
      $.keyword_data,
      choice($.keyword_into, $.keyword_overwrite),
      $.object_reference,
      optional($.column_definitions),
      optional($.options_clause),
      $.keyword_from,
      $.keyword_files,
      '(',
      comma_list(seq($.identifier, '=', $._expression), true),
      ')',
    ),

    keyword_load:      _ => token(prec(1, make_keyword("load"))),
    keyword_files:     _ => token(prec(1, make_keyword("files"))),
    keyword_overwrite: _ => token(prec(1, make_keyword("overwrite"))),

    // ── CREATE: add BigQuery CREATE types ──────────────────────────────────
    _create_statement: $ => seq(
      choice(
        // base (re-enumerated from grammar/statements/create.js)
        $.create_table,
        $.create_view,
        $.create_materialized_view,
        $.create_index,
        $.create_function,
        $.create_procedure,
        $.create_type,
        $.create_database,
        $.create_role,
        $.create_sequence,
        $.create_trigger,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
        // BigQuery-specific
        $.create_model,
        $.create_snapshot_table,
      ),
    ),

    // CREATE SNAPSHOT TABLE [IF NOT EXISTS] name CLONE source
    //   [FOR SYSTEM_TIME AS OF t] [OPTIONS (…)]
    create_snapshot_table: $ => prec.right(seq(
      $.keyword_create,
      $.keyword_snapshot,
      $.keyword_table,
      optional($._if_not_exists),
      $.object_reference,
      $.keyword_clone,
      $.object_reference,
      optional($.for_system_time_as_of),
      optional($.options_clause),
    )),

    keyword_clone: _ => token(prec(1, make_keyword("clone"))),

    // ── term: allow SELECT * EXCEPT / REPLACE ──────────────────────────────
    term: $ => seq(
      field(
        'value',
        choice(
          $.all_fields,
          $.all_fields_except,
          $.all_fields_replace,
          $._expression,
        ),
      ),
      optional($._alias),
    ),

    // ── _expression: add BQ struct, array, typed literal, triple-string ────
    _expression: $ => prec(1, choice(
      $.literal,
      alias($._qualified_field, $.field),
      $.parameter,
      $.list,
      $.case,
      $.window_function,
      $.subquery,
      $.cast,
      $.exists,
      $.invocation,
      $.binary_expression,
      $.subscript,
      $.unary_expression,
      $.array,
      $.interval,
      $.between_expression,
      // Inherited from base but this dialect fully re-enumerates
      // _expression: LIKE/NOT LIKE now parse exclusively through
      // like_expression (with optional ESCAPE), not binary_expression.
      $.like_expression,
      $.parenthesized_expression,
      // BigQuery-specific
      $.struct,
      $.typed_literal,
      $.triple_double_quoted_string,
      $.triple_single_quoted_string,
      $.ml_function,
    )),

    // ── from: add QUALIFY after HAVING ─────────────────────────────────────
    from: $ => seq(
      $.keyword_from,
      optional($.keyword_only),
      comma_list(field('relation', $.relation), true),
      repeat(
        choice(
          $.join,
          $.cross_join,
          $.lateral_join,
          $.lateral_cross_join,
        ),
      ),
      optional($.where),
      optional($.group_by),
      optional($.having),
      optional($.qualify),
      optional($.window_clause),
      optional($.order_by),
      // GoogleSQL paging is LIMIT/OFFSET only; no ANSI OFFSET…FETCH FIRST.
      optional($.limit),
    ),

    // TABLESAMPLE SYSTEM ( <number> PERCENT )
    tablesample: $ => seq(
      $.keyword_tablesample,
      $.keyword_system,
      '(',
      $._natural_number,
      $.keyword_percent,
      ')',
    ),

    // ── relation: add UNNEST as a FROM source ───────────────────────────────
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
          $.unnest,
        ),
        optional($.for_system_time_as_of),
        optional($.tablesample),
        optional(choice($.pivot_clause, $.unpivot_clause)),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    keyword_pivot:      _ => token(prec(1, make_keyword("pivot"))),
    keyword_unpivot:    _ => token(prec(1, make_keyword("unpivot"))),
    keyword_system_time: _ => token(prec(1, /[Ss][Yy][Ss][Tt][Ee][Mm]_[Tt][Ii][Mm][Ee]/)),

    // FOR SYSTEM_TIME AS OF <timestamp>: time-travel table reference.
    for_system_time_as_of: $ => seq(
      $.keyword_for,
      $.keyword_system_time,
      $.keyword_as,
      $.keyword_of,
      field('time_point', $._expression),
    ),

    // ── identifier: add backtick quoting ────────────────────────────────────
    _bq_backtick_quoted_string: _ => /`[^`]*`/,

    identifier: $ => choice(
      $._identifier,
      $.dynamic_identifier,
      $.dynamic_composite_identifier,
      $._double_quote_string,
      $._bq_backtick_quoted_string,
    ),

    // BigQuery-specific keywords (not ANSI)
    // token(prec(1,...)) ensures they win over identifier in all lexer states
    keyword_struct:     _ => token(prec(1, make_keyword("struct"))),
    keyword_export:     _ => token(prec(1, make_keyword("export"))),
    keyword_model:      _ => token(prec(1, make_keyword("model"))),
    keyword_ml:         _ => token(prec(1, make_keyword("ml"))),
    keyword_predict:    _ => token(prec(1, make_keyword("predict"))),
    keyword_evaluate:   _ => token(prec(1, make_keyword("evaluate"))),
    keyword_assert:     _ => token(prec(1, make_keyword("assert"))),
    keyword_continue:   _ => token(prec(1, make_keyword("continue"))),
    keyword_error:      _ => token(prec(1, make_keyword("error"))),
    keyword_exception:  _ => token(prec(1, make_keyword("exception"))),
    keyword_qualify:    _ => token(prec(1, make_keyword("qualify"))),
    keyword_string:     _ => token(prec(1, make_keyword("string"))),
    keyword_while:      _ => token(prec(1, make_keyword("while"))),
    keyword_loop:       _ => token(prec(1, make_keyword("loop"))),
    keyword_leave:      _ => token(prec(1, make_keyword("leave"))),
    keyword_iterate:    _ => token(prec(1, make_keyword("iterate"))),
    keyword_call:       _ => token(prec(1, make_keyword("call"))),
    keyword_raise:      _ => token(prec(1, make_keyword("raise"))),
    keyword_message:    _ => token(prec(1, make_keyword("message"))),
    keyword_return:     _ => token(prec(1, make_keyword("return"))),
    // prefix-shadow guard: keyword_return at prec 1 must not shadow RETURNING
    keyword_returning:  _ => token(prec(1, make_keyword("returning"))),
    keyword_elseif:     _ => token(prec(1, make_keyword("elseif"))),
    keyword_source:     _ => token(prec(1, make_keyword("source"))),
    keyword_options:    _ => token(prec(1, make_keyword("options"))),

    // Administrative DDL object types. Each is a prec-1 token so it wins over
    // the identifier regex on equal-length matches; the cost is that these
    // words can no longer be used as bare identifiers in this dialect.
    // `data_policy` sits above the base's prec-0 `data` keyword, so the longer
    // token is reachable.
    keyword_copy:         _ => token(prec(1, make_keyword("copy"))),
    keyword_access:       _ => token(prec(1, make_keyword("access"))),
    keyword_policy:       _ => token(prec(1, make_keyword("policy"))),
    keyword_capacity:     _ => token(prec(1, make_keyword("capacity"))),
    keyword_bi_capacity:  _ => token(prec(1, make_keyword("bi_capacity"))),
    keyword_reservation:  _ => token(prec(1, make_keyword("reservation"))),
    keyword_assignment:   _ => token(prec(1, make_keyword("assignment"))),
    keyword_data_policy:  _ => token(prec(1, make_keyword("data_policy"))),
    keyword_organization: _ => token(prec(1, make_keyword("organization"))),
    keyword_project:      _ => token(prec(1, make_keyword("project"))),
    keyword_undrop:       _ => token(prec(1, make_keyword("undrop"))),
    keyword_replica:      _ => token(prec(1, make_keyword("replica"))),
    keyword_rebuild:      _ => token(prec(1, make_keyword("rebuild"))),
    keyword_enforced:     _ => token(prec(1, make_keyword("enforced"))),
    keyword_policies:     _ => token(prec(1, make_keyword("policies"))),
    keyword_aggregate:    _ => token(prec(1, make_keyword("aggregate"))),
    keyword_search:     _ => token(prec(1, make_keyword("search"))),
    keyword_vector:     _ => token(prec(1, make_keyword("vector"))),
    keyword_columns:    _ => token(prec(1, make_keyword("columns"))),
    keyword_int64:      _ => token(prec(1, make_keyword("int64"))),
    keyword_float64:    _ => token(prec(1, make_keyword("float64"))),
    keyword_bytes:      _ => token(prec(1, make_keyword("bytes"))),
    keyword_bignumeric: _ => token(prec(1, make_keyword("bignumeric"))),
    keyword_geography:  _ => token(prec(1, make_keyword("geography"))),
    keyword_datetime:   _ => token(prec(1, make_keyword("datetime"))),
    keyword_unnest:     _ => token(prec(1, make_keyword("unnest"))),
    keyword_declare:    _ => token(prec(1, make_keyword("declare"))),
    keyword_cluster:    _ => token(prec(1, make_keyword("cluster"))),

    // ── Spread all BigQuery rule modules ────────────────────────────────────
    ...select_rules,
    ...expr_rules,
    ...string_rules,
    ...scripting_rules,
    ...ddl_rules,
    ...ml_rules,
    ...types_rules,
    ...objects_rules,
    ...alter_rules,


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_called: _ => token(prec(1, make_keyword("called"))),
    keyword_returns: _ => token(prec(1, make_keyword("returns"))),

  },
}));
