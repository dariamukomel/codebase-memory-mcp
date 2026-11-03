import base from '../grammar.js';
import { optional_parenthesis, make_keyword, wrapped_in_parenthesis, canonicalOrder } from '../grammar/helpers.js';
import duckdb_select_rules from './grammar/select.js';
import duckdb_pivot_rules from './grammar/pivot.js';
import duckdb_expression_rules from './grammar/expressions.js';
import duckdb_type_rules from './grammar/types.js';
import duckdb_statement_rules from './grammar/statements.js';
import duckdb_admin_rules from './grammar/admin.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'duckdb_sql',

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
    // DuckDB from-first vs regular from
    [$.from_first_select, $.from],
    // from_first_select in statement vs _dml_read
    [$.statement, $._dml_read],
    // * EXCLUDE/REPLACE/RENAME vs all_fields
    [$.all_fields_exclude, $.all_fields],
    [$.all_fields_replace, $.all_fields],
    [$.all_fields_rename, $.all_fields],
    // struct_type parsing
    [$.struct_type],
    // lambda (x, y) -> expr  vs  object_reference / _qualified_field
    [$.object_reference, $._qualified_field, $.lambda_expression],
    [$._qualified_field, $.lambda_expression],
    [$.lambda_expression],
    // lambda body vs binary_expression
    [$.binary_expression, $.lambda_expression],
    // pivot ON col_list vs IN
    [$.binary_expression, $.pivot_statement],
    [$.between_expression, $.pivot_statement],
    [$.list, $.pivot_statement],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


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
        $.attach_statement,
        $.detach_statement,
        $.install_statement,
        $.load_statement,
        $.summarize_statement,
        $.pivot_statement,
        $.unpivot_statement,
        $.from_first_select,
        $.copy_statement,
        $.export_database_statement,
        $.import_database_statement,
        $.prepare_statement,
        $.execute_statement,
        $.deallocate_statement,
        $.show_statement,
        // grammar/admin.js
        $.checkpoint_statement,
        $.vacuum_statement,
        $.analyze_statement,
        $.call_statement,
        $.describe_statement,
        $.set_config_statement,
        $.reset_config_statement,
        $.set_variable_statement,
      ),
    ),

    _create_statement: $ => seq(
      choice(
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
        $.create_macro_statement,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    _dml_read: $ => seq(
      optional(optional_parenthesis($._cte)),
      optional_parenthesis(
        choice(
          $._select_statement,
          $.set_operation,
          $.from_first_select,
        ),
      ),
    ),

    // DuckDB: COMMENT ON is supported (re-enumerates base _ddl_statement)
    // MERGE INTO is supported since DuckDB 1.4.0 (2025-09), alongside the
    // older ON CONFLICT upsert form.
    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.grant_statement,
      $.revoke_statement,
      $.comment_statement,
      $.use_statement,
      // grammar/admin.js
      $.create_secret_statement,
      $.drop_secret_statement,
    ),

    // DuckDB: INSERT/UPDATE/DELETE support RETURNING (same syntax as PostgreSQL)
    _insert_statement: $ => seq(
      $.insert,
      optional($.returning),
    ),

    // base insert plus INSERT OR REPLACE|IGNORE and ON CONFLICT upsert
    insert: $ => seq(
      $.keyword_insert,
      optional(seq($.keyword_or, choice($.keyword_replace, $.keyword_ignore))),
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
      optional($._on_conflict),
    ),

    // base _on_conflict plus DuckDB's optional conflict target column list
    _on_conflict: $ => seq(
      $.keyword_on,
      $.keyword_conflict,
      optional(alias($._column_list, $.list)),
      seq(
        $.keyword_do,
        choice(
          $.keyword_nothing,
          seq(
            $.keyword_update,
            $._set_values,
            optional($.where),
          ),
        ),
      ),
    ),

    _update_statement: $ => seq(
      $.update,
      optional($.returning),
    ),

    _delete_statement: $ => seq(
      $.delete,
      alias($._delete_from, $.from),
      optional($.returning),
    ),

    // Override _expression to add lambda, struct, map literals, list comprehension, file_reader
    _expression: $ => prec(1,
      choice(
        $.literal,
        alias($._qualified_field, $.field),
        $.parameter,
        $.list,
        $.case,
        $.window_function,
        $.subquery,
        $.cast,
        alias($.implicit_cast, $.cast),
        $.exists,
        $.file_reader,
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
        // ANSI typed temporal literal (F051-03): DATE/TIME/TIMESTAMP '…'.
        $.typed_temporal_literal,
        $.parenthesized_expression,
        $.lambda_expression,
        $.struct_literal,
        $.map_literal,
        $.list_comprehension,
      ),
    ),

    // Override relation to add file_reader as a FROM source
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.file_reader,
          $.invocation,
          $.object_reference,
          wrapped_in_parenthesis($.values),
        ),
        optional($.tablesample),
        optional(
          seq(
            $._alias,
            optional(alias($._column_list, $.list)),
          ),
        ),
      ),
    ),

    // Keep PostgreSQL-style :: cast from postgres (also used in DuckDB)
    implicit_cast: $ => seq(
      $._expression,
      '::',
      $._type,
    ),

    // DuckDB-specific keywords
    keyword_returning:  _ => token(prec(1, make_keyword("returning"))),
    keyword_prepare:    _ => token(prec(1, make_keyword("prepare"))),
    keyword_deallocate: _ => token(prec(1, make_keyword("deallocate"))),
    keyword_show:       _ => token(prec(1, make_keyword("show"))),
    keyword_databases:  _ => token(prec(1, make_keyword("databases"))),
    keyword_attach:     _ => token(prec(1, make_keyword("attach"))),
    keyword_detach:     _ => token(prec(1, make_keyword("detach"))),
    keyword_install:    _ => token(prec(1, make_keyword("install"))),
    keyword_summarize:  _ => token(prec(1, make_keyword("summarize"))),
    keyword_asof:       _ => token(prec(1, make_keyword("asof"))),
    keyword_positional: _ => token(prec(1, make_keyword("positional"))),
    keyword_map:        _ => token(prec(1, make_keyword("map"))),
    keyword_struct:     _ => token(prec(1, make_keyword("struct"))),
    keyword_qualify:    _ => token(prec(1, make_keyword("qualify"))),
    keyword_load:       _ => token(prec(1, make_keyword("load"))),
    keyword_pivot:      _ => token(prec(1, make_keyword("pivot"))),
    keyword_unpivot:    _ => token(prec(1, make_keyword("unpivot"))),
    keyword_name:       _ => token(prec(1, make_keyword("name"))),
    keyword_copy:       _ => token(prec(1, make_keyword("copy"))),
    keyword_macro:      _ => token(prec(1, make_keyword("macro"))),
    keyword_export:     _ => token(prec(1, make_keyword("export"))),
    keyword_import:     _ => token(prec(1, make_keyword("import"))),
    keyword_read_csv:       _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Cc][Ss][Vv]/)),
    keyword_read_csv_auto:  _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Cc][Ss][Vv]_[Aa][Uu][Tt][Oo]/)),
    keyword_read_parquet:   _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Pp][Aa][Rr][Qq][Uu][Ee][Tt]/)),
    keyword_read_json:      _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Jj][Ss][Oo][Nn]/)),
    keyword_read_json_auto: _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Jj][Ss][Oo][Nn]_[Aa][Uu][Tt][Oo]/)),
    keyword_read_orc:       _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Oo][Rr][Cc]/)),
    keyword_read_avro:      _ => token(prec(1, /[Rr][Ee][Aa][Dd]_[Aa][Vv][Rr][Oo]/)),

    // DuckDB native type keywords
    keyword_hugeint:    _ => make_keyword("hugeint"),
    keyword_uinteger:   _ => make_keyword("uinteger"),
    keyword_ubigint:    _ => make_keyword("ubigint"),
    keyword_usmallint:  _ => make_keyword("usmallint"),
    keyword_utinyint:   _ => make_keyword("utinyint"),
    keyword_tinyint:    _ => make_keyword("tinyint"),
    keyword_blob:       _ => make_keyword("blob"),
    keyword_uuid:       _ => make_keyword("uuid"),
    keyword_varint:     _ => make_keyword("varint"),

    // ── Keywords for the statements in grammar/admin.js ────────────────────
    keyword_checkpoint: _ => token(prec(1, make_keyword("checkpoint"))),
    keyword_force:      _ => token(prec(1, make_keyword("force"))),
    keyword_vacuum:     _ => token(prec(1, make_keyword("vacuum"))),
    keyword_describe:   _ => token(prec(1, make_keyword("describe"))),
    keyword_global:     _ => token(prec(1, make_keyword("global"))),
    keyword_variable:   _ => token(prec(1, make_keyword("variable"))),
    keyword_secret:     _ => token(prec(1, make_keyword("secret"))),
    keyword_persistent: _ => token(prec(1, make_keyword("persistent"))),
    keyword_call:       _ => token(prec(1, make_keyword("call"))),
    // Lexer-precedence guard: `call` is a strict prefix of the base grammar's
    // prec-0 `called`, and precedence beats match length, so `called` has to
    // be re-declared at the same precedence to stay lexable here.
    keyword_called:     _ => token(prec(1, make_keyword("called"))),

    ...duckdb_select_rules,
    ...duckdb_pivot_rules,
    ...duckdb_expression_rules,
    ...duckdb_type_rules,
    ...duckdb_statement_rules,
    ...duckdb_admin_rules,

  },
}));
