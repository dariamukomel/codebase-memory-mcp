import base from '../grammar.js';
import { paren_list, optional_parenthesis, comma_list, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';

import qualify_rules     from './grammar/qualify.js';
import pivot_rules       from './grammar/pivot.js';
import match_rec_rules   from './grammar/match_recognize.js';
import time_travel_rules from './grammar/time_travel.js';
import snowflake_property_rules from './grammar/properties.js';
import variant_rules     from './grammar/variant.js';
import scripting_rules   from './grammar/scripting.js';
import execute_rules     from './grammar/execute.js';
import object_keyword_rules from './grammar/object_keywords.js';
import create_platform_rules from './grammar/create_platform.js';
import alter_platform_rules from './grammar/alter_platform.js';
import copy_rules        from './grammar/copy.js';
import create_rules      from './grammar/create.js';
import create_table_rules from './grammar/create_table.js';
import alter_table_rules from './grammar/alter_table.js';
import type_rules from './grammar/types.js';
import alter_rules       from './grammar/alter.js';
import use_rules         from './grammar/use.js';
import stage_rules       from './grammar/stage.js';
import object_statement_rules from './grammar/object_statements.js';
import grant_rules from './grammar/grant.js';
import query_extra_rules from './grammar/query_extras.js';
import create_object_rules from './grammar/create_objects.js';
import misc_statement_rules from './grammar/misc_statements.js';
import expression_extra_rules from './grammar/expressions_extra.js';
import alter_other_rules from './grammar/alter_other.js';
import files_rules      from './grammar/files.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';
import create_routine_rules from './grammar/create_routines.js';
import alter_object_rules from './grammar/alter_objects.js';

export default canonicalOrder(grammar(base, {
  name: 'snowflake_sql',

  externals: ($, previous) => [
    ...previous,
    $._dollar_quoted_string_start_tag,
    $._dollar_quoted_string_end_tag,
    $._dollar_quoted_string,
  ],

  conflicts: $ => [
    // Inherited base conflicts
    [$.object_reference, $._qualified_field],
    // CREATE TABLE ... FROM ARCHIVE OF t WHERE cond LIKE ...: the condition can continue with LIKE or the
    // next table clause (LIKE other_table) can start.
    [$.where, $.like_expression],
    [$.drop_column],
    // ARRAY(subquery) vs a column named array.
    [$._qualified_field, $.array],
    // DATE(expr) function vs a column named date.
    [$._qualified_field, $.date_function],
    // IDENTIFIER(...) function vs a column named identifier.
    [$._qualified_field, $.identifier_function],
    // PERIOD(DATE) '...' typed literal vs f(date) with a column named date.
    [$._qualified_field, $.parameterized_literal],
    // PERIOD(TIME) / PERIOD(TIMESTAMP) vs f(time) / f(timestamp) with columns of those names.
    [$._qualified_field, $.time],
    [$._qualified_field, $.timestamp],
    // A column named index / primary / foreign vs the INDEX / PRIMARY KEY / FOREIGN KEY table clauses.
    [$._column, $.index_definition],
    [$._column, $.table_constraint],
    // FROM FIRST | LAST after a window call vs the FROM clause of the enclosing SELECT.
    [$._expression, $.window_function],
    [$.field, $._qualified_field],
    [$._column, $._qualified_field],
    [$.object_reference],
    // Local shift/reduce ambiguity shared with like_expression's optional
    // ESCAPE tail; kept in sync with the base grammar's conflicts.
    [$.between_expression, $.binary_expression, $.like_expression],
    // UNIQUE NOT NULL: NOT starts either a constraint property (NOT ENFORCED) or the next column constraint.
    [$.inline_constraint],
    [$.alter_column],
    [$.create_function],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
    // Snowflake-specific conflicts
    [$._function_return, $.return_statement],
    // ARRAY(x INT): x is an argument name or the start of a custom type name.
    [$.object_reference, $.type_argument],
    [$.function_argument, $.object_reference],
    // `*` starts both a plain all_fields and a transformed one.
    [$.all_fields_transform, $.all_fields],
    // Consecutive INTO clauses in a multi-table INSERT.
    [$.insert_into_clause],
    // Comma-position LATERAL fn(...) as a relation overlaps with the base
    // JOIN LATERAL / CROSS JOIN LATERAL join forms and their trailing alias;
    // GLR explores each until ON / ',' / end disambiguates.
    [$.relation, $.lateral_cross_join],
    [$._alias, $.lateral_join],
    [$._alias, $.lateral_cross_join],
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,

    // ── Program: add scripting top-level blocks ─────────────────────────────
    program: $ => seq(
      repeat(seq(
        choice(
          $.statement,
        ),
        ';',
      )),
      optional($.statement),
    ),

    // ── Statement: add scripting statements ────────────────────────────────
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional($.keyword_analyze),
        optional($.keyword_verbose),
        optional(seq($.keyword_using, choice($.keyword_tabular, $.keyword_json, $.keyword_text))),
      )),
      $._statement_body,
      // Pipe operator: stmt ->> stmt ->> ..., later statements read earlier results as $1, $2, ...
      repeat(seq($.pipe_operator, $._statement_body)),
    ),

    _statement_body: $ => choice(
      $._ddl_statement,
      $._dml_write,
      optional_parenthesis($._dml_read),
      $._transaction_statement,
      $.let_statement,
      $.assignment_statement,
      $.if_statement,
      $.case_statement,
      $.while_statement,
      $.repeat_statement,
      $.loop_statement,
      $.break_statement,
      $.continue_statement,
      $.null_statement,
      $.open_statement,
      $.fetch_statement,
      $.close_statement,
      $.async_statement,
      $.await_statement,
      $.cancel_statement,
      $.compound_statement,
      $.return_statement,
      $.raise_statement,
      $.for_statement,
      $.undrop_statement,
      $.unset_statement,
      $.call_statement,
      $.call_with_anonymous_procedure,
    ),

    pipe_operator: _ => token(prec(2, '->>')),

    // ── DDL: add Snowflake-specific statements ──────────────────────────────
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
      // Snowflake additions
      $.execute_immediate_statement,
      $.execute_task,
      $.execute_dbt_project,
      $.execute_alert,
      $.execute_experiment,
      $.execute_dcm_project,
      $.execute_job_service,
      $.execute_notebook,
      $.execute_notebook_project,
      $.execute_code_bundle,
      $.copy_into,
      $.use_statement,
      $.use_secondary_roles,
      $.list_stage_statement,
      $.put_statement,
      $.get_statement,
      $.remove_statement,
      $.copy_files_statement,
      $.show_statement,
      $.describe_statement,
      $.comment_statement,
    ),

    // ── TRUNCATE: add the MATERIALIZED VIEW target ─────────────────────────
    // https://docs.snowflake.com/en/sql-reference/sql/truncate-materialized-view
    // ── SELECT … FOR UPDATE [NOWAIT | WAIT <n>] (hybrid tables) ────────────
    _select_statement: $ => optional_parenthesis(
      seq(
        $.select,
        optional(
          seq(
            $.keyword_into,
            $.select_expression,
          ),
        ),
        optional(choice($.from, $.where)),
        optional($.locking_clause),
      ),
    ),

    locking_clause: $ => seq(
      $.keyword_for,
      $.keyword_update,
      optional(
        choice(
          $.keyword_nowait,
          seq($.keyword_wait, alias($._integer, $.literal)),
        ),
      ),
    ),

    // ── DROP ─────────────────────────────────────────────────────────────
    _drop_statement: $ => seq(
      choice(
        $.drop_table,
        $.drop_view,
        $.drop_materialized_view,
        $.drop_index,
        $.drop_type,
        $.drop_sequence,
        $.drop_object,
      ),
    ),

    // ── CREATE: add Snowflake CREATE types ─────────────────────────────────
    _create_statement: $ => seq(
      choice(
        // base (re-enumerated from grammar/statements/create.js)
        $.create_table,
        $.create_view,
        $.create_materialized_view,
        $.create_index,
        $.create_function,
        $.create_procedure,
        $.create_database,
        $.create_role,
        $.create_tag,
        $.create_sequence,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
        // Snowflake-specific
        $.create_stream,
        $.create_task,
        $.create_dynamic_table,
        $.create_alert,
        $.create_pipe,
        $.create_user,
        $.create_network_policy,
        $.create_network_rule,
        $.create_share,
        $.create_database_role,
        $.create_event_table,
        $.create_account_object,
        $.create_masking_policy,
        $.create_row_access_policy,
        $.create_stage,
        $.create_warehouse_statement,
        $.create_file_format_statement,
        $.create_external_table,
        $.create_integration,
        $.create_platform_object,
        $.create_dataset,
        $.create_replication_group,
        $.create_ai_function,
        $.create_interactive_table,
        $.create_type,
        $.create_semantic_view,
      ),
    ),

    // CREATE [OR REPLACE] {STORAGE|API|NOTIFICATION|SECURITY|CATALOG
    //   |EXTERNAL ACCESS} INTEGRATION [IF NOT EXISTS] name
    //   TYPE = t <option> = <value> …
    // Snowflake's named connection objects to services outside the account.
    // The option list is open-ended and integration-type specific, so it is
    // parsed as `name = value` pairs rather than enumerated.
    create_integration: $ => prec.left(seq(
      $.keyword_create,
      optional($._or_replace_or_alter),
      choice(
        $.keyword_storage,
        $.keyword_api,
        $.keyword_notification,
        $.keyword_security,
        $.keyword_catalog,
        seq($.keyword_external, $.keyword_access),
      ),
      $.keyword_integration,
      optional($._if_not_exists),
      field('name', $.identifier),
      repeat1($.integration_option),
    )),

    integration_option: $ => seq(
      // TYPE, ENABLED and COMMENT are extracted keywords, so they cannot
      // arrive here as identifiers and are listed explicitly.
      field('name', choice(
        $.identifier,
        $.keyword_type,
        $.keyword_enabled,
        $.keyword_comment,
      )),
      '=',
      field('value', choice($.literal, $.object_reference, $.integration_option_group)),
    ),

    // REST_AUTHENTICATION = (TYPE = BEARER BEARER_TOKEN = 'tok'): a parenthesised group of options,
    // or a plain list of values: ALLOWED_LOCATIONS = ('s3://a/', 's3://b/')
    integration_option_group: $ => seq(
      '(',
      optional(choice(
        repeat1($.integration_option),
        // values, or 'header' = 'value' pairs (WEBHOOK_HEADERS)
        comma_list(choice(seq($.literal, '=', $.literal), $.literal, $.identifier), true),
      )),
      ')',
    ),

    keyword_storage:      _ => token(prec(1, make_keyword("storage"))),
    keyword_api:          _ => token(prec(1, make_keyword("api"))),
    keyword_notification: _ => token(prec(1, make_keyword("notification"))),
    keyword_enabled:      _ => token(prec(1, make_keyword("enabled"))),

    // ── ALTER: add ALTER SESSION + masking policy alter ─────────────────────
    _alter_statement: $ => seq(
      choice(
        // base (re-enumerated from grammar/statements/alter.js)
        $.alter_table,
        $.alter_schema,
        $.alter_type,
        $.alter_index,
        $.alter_database,
        $.alter_sequence,
        // Snowflake-specific
        $.alter_session,
        $.alter_stage,
        $.alter_view,
        $.alter_materialized_view,
        $.alter_task,
        $.alter_dynamic_table,
        $.alter_alert,
        $.alter_warehouse,
        $.alter_stream,
        $.alter_pipe,
        $.alter_role,
        $.alter_user,
        $.alter_routine,
        $.alter_file_format,
        $.alter_share,
        $.alter_network_policy,
        $.alter_masking_policy,
        $.alter_row_access_policy,
        $.alter_tag,
        $.alter_external_table,
        $.alter_iceberg_table,
        $.alter_integration,
        $.alter_account_object,
        $.alter_platform_object,
        $.alter_application,
        $.alter_application_package,
        $.alter_semantic_view,
        $.alter_organization,
        $.alter_account,
        $.alter_table_cluster,
      ),
    ),

    // ── DML: add RETURNING to INSERT / UPDATE / DELETE (#116) ───────────────
    _insert_statement: $ => choice(
      seq($.insert, optional($.returning)),
      $.multi_table_insert,
    ),

    // INSERT [OVERWRITE] ALL INTO … INTO … SELECT …            (unconditional)
    // INSERT [OVERWRITE] {ALL|FIRST} WHEN c THEN INTO … [ELSE INTO …] SELECT …
    multi_table_insert: $ => seq(
      $.keyword_insert,
      optional($.keyword_overwrite),
      choice(
        seq($.keyword_all, repeat1($.insert_into_clause)),
        seq(
          choice($.keyword_all, $.keyword_first),
          repeat1(seq($.keyword_when, $._expression, $.keyword_then, repeat1($.insert_into_clause))),
          optional(seq($.keyword_else, repeat1($.insert_into_clause))),
        ),
      ),
      $._dml_read,
    ),

    insert_into_clause: $ => seq(
      $.keyword_into,
      field('target', $.object_reference),
      optional(paren_list($.identifier, true)),
      optional(seq($.keyword_values, paren_list($._expression, true))),
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

    // ── CALL: invoke a stored procedure ─────────────────────────────────────

    // ── INSERT: add Snowflake INSERT OVERWRITE INTO ─────────────────────────
    insert: $ => seq(
      $.keyword_insert,
      optional($.keyword_overwrite),
      optional($.keyword_into),
      field('target', $.object_reference),
      optional(
        seq(
          $.keyword_as,
          field('alias', $.identifier)
        ),
      ),
      choice(
        $._insert_values,
        $._set_values,
        // INSERT INTO t VALUES 12: a single bare value
        seq($.keyword_values, $.literal),
      ),
    ),

    // base _alter_specifications plus Snowflake's object-property actions:
    //   ALTER TABLE t SET COMMENT = 'x' | UNSET COMMENT
    _alter_specifications: $ => choice(
      $.add_column,
      $.add_constraint,
      $.drop_constraint,
      $.alter_constraint,
      $.modify_constraint,
      $.rename_constraint,
      $.alter_column,
      $.change_column,
      $.drop_column,
      $.rename_object,
      $.rename_column,
      $.set_schema,
      $.change_ownership,
      $.snowflake_table_action,
      // prec.right: alter_table already comma-separates its specifications,
      // so a ',' after a property is ambiguous between continuing this list
      // and starting the next specification. Right associativity binds it to
      // the inner list, which is the reading Snowflake documents. Properties
      // may also follow one another with no separator.
      prec.right(seq($.keyword_set, $.snowflake_property, repeat(seq(optional(','), $.snowflake_property)))),
      prec.right(seq($.keyword_unset, comma_list($.identifier, true))),
    ),

    from_values: $ => seq(
      $.values,
      optional(seq($._alias, optional(alias($._column_list, $.list)))),
    ),

    // ── SELECT / FROM: add QUALIFY after HAVING ─────────────────────────────
    // prec.right: a trailing ORDER BY / LIMIT / FETCH after the last operand of a set operation belongs to that
    // operand's FROM, not to the set operation (a parenthesised last operand leaves it to the set operation)
    from: $ => prec.right(seq(
      $.keyword_from,
      optional($.keyword_only),
      choice(
        comma_list(field('relation', $.relation), true),
        // FROM VALUES (1), (2) without the outer parentheses (a lone source, so its commas are the list's)
        $.from_values,
      ),
      optional($.index_hint),
      repeat(choice(
        $.join,
        $.cross_join,
        $.lateral_join,
        $.lateral_cross_join,
        $.asof_join,
      )),
      optional($.where),
      optional(seq($.connect_by_clause, optional($.where))),
      optional($.group_by),
      optional($.having),
      optional($.qualify),
      optional($.window_clause),
      optional($.order_by),
      optional($.limit),
      optional($.offset_fetch_clause),
    )),

    // Add PRIOR as a unary operator (re-enumerates the base operator table).
    unary_expression: $ => choice(
      ...[
        [$.keyword_not, 'unary_not'],
        [$.bang, 'unary_not'],
        [$.keyword_any, 'unary_not'],
        [$.keyword_some, 'unary_not'],
        [$.keyword_all, 'unary_not'],
        [$.keyword_prior, 'unary_not'],
        [$.op_unary_other, 'unary_other'],
      ].map(([operator, precedence]) =>
        prec.left(precedence, seq(
          field('operator', operator),
          field('operand', $._expression),
        ))
      ),
      $._signed_operand,
    ),

    keyword_connect: _ => token(prec(1, make_keyword("connect"))),
    keyword_prior:   _ => token(prec(1, make_keyword("prior"))),
    keyword_nocycle: _ => token(prec(1, make_keyword("nocycle"))),
    keyword_ilike:   _ => token(prec(1, make_keyword("ilike"))),

    // SELECT * [ILIKE 'pattern'] [EXCLUDE …] [RENAME …] column transformers.
    term: $ => seq(
      field('value', choice(
        $.all_fields_transform,
        $.all_fields,
        $._expression,
      )),
      optional($._alias),
    ),

    all_fields_transform: $ => seq(
      optional(seq($.object_reference, '.')),
      '*',
      choice(
        seq($._ilike_pattern, optional($._exclude_columns), optional($._rename_columns)),
        seq($._exclude_columns, optional($._rename_columns)),
        $._rename_columns,
      ),
    ),

    _ilike_pattern: $ => seq($.keyword_ilike, alias($._literal_string, $.literal)),

    _exclude_columns: $ => seq(
      $.keyword_exclude,
      choice(field('col', $.identifier), paren_list(field('col', $.identifier), true)),
    ),

    _rename_columns: $ => seq(
      $.keyword_rename,
      choice(
        seq(field('old', $.identifier), $.keyword_as, field('new', $.identifier)),
        paren_list(seq(field('old', $.identifier), $.keyword_as, field('new', $.identifier)), true),
      ),
    ),

    // GROUP BY ALL groups by every non-aggregated item in the SELECT list.
    group_by: $ => prec.left(seq(
      $.keyword_group,
      $.keyword_by,
      choice(
        $.keyword_all,
        seq(
          comma_list(choice(
            $._expression,
            $.rollup_clause,
            $.cube_clause,
            $.grouping_sets_clause,
          ), true),
          optional(seq($.keyword_with, choice($.keyword_rollup, $.keyword_cube))),
        ),
      ),
    )),

    // ── relation: add time travel, PIVOT, UNPIVOT, MATCH_RECOGNIZE ──────────
    relation: $ => prec.right(
      seq(
        choice(
          $.subquery,
          $.invocation,
          $.object_reference,
          // $1: the result of an earlier statement in a ->> pipe
          $.parameter,
          wrapped_in_parenthesis($.values),
          $.joined_relation,
          $.semantic_view_clause,
          // Snowflake: @stage as a FROM source, optionally with (FILE_FORMAT => ..., PATTERN => ...)
          seq($.stage_ref, optional(paren_list($.named_argument, true))),
          // Snowflake: comma-position LATERAL FLATTEN(...) / LATERAL (subquery)
          seq($.keyword_lateral, choice($.invocation, $.subquery)),
        ),
        optional($.time_travel_clause),
        optional($.changes_clause),
        optional($.tablesample),
        optional(choice(
          $.pivot_clause,
          $.unpivot_clause,
        )),
        optional($.match_recognize_clause),
        optional(seq(
          $._alias,
          optional(alias($._column_list, $.list)),
        )),
        optional($.tablesample),
        optional($.resample_clause),
      ),
    ),

    // ── _expression: add variant colon-path access and :: cast ──────────────
    _expression: $ => prec(1, choice(
      $.literal,
      alias($._qualified_field, $.field),
      $.parameter,
      $.bind_variable,
      $.array_constant,
      $.object_constant,
      $.spread_expression,
      $.collate_expression,
      $.position_expression,
      $.list,
      $.case,
      $.window_function,
      $.subquery,
      $.cast,
      alias($._colon_cast, $.cast),
      $.exists,
      $.invocation,
      $.binary_expression,
      $.subscript,
      $.path_access,
      $.parameterized_literal,
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
      // Snowflake-specific
      $.variant_access,
      $.lambda_expression,
      $.connect_by_root,
      $.outer_join_marker,
      $.date_function,
    )),

    // base invocation plus Snowflake named arguments: fn(name => value, …)
    // (e.g. FLATTEN(INPUT => t.col)); re-enumerates the base alternatives.
    invocation: $ => prec(1,
      seq(
        $.object_reference,
        choice(
          // default invocation; each argument is positional or named (name => value), and they may be mixed:
          // FLATTEN(v, RECURSIVE => TRUE). RECURSIVE is a keyword elsewhere but a plain name here.
          paren_list(
            choice(
              seq(
                optional($.keyword_distinct),
                field('parameter', $.term),
                optional($.order_by),
              ),
              seq(
                field('name', choice($.identifier, alias($.keyword_recursive, $.identifier))),
                '=>',
                field('value', $._expression),
              ),
            ),
          ),
          // EXTRACT(unit FROM term)
          paren_list(
            seq(
              field('unit', choice($.object_reference, alias($._literal_string, $.literal))),
              $.keyword_from,
              $.term,
            ),
          ),
          // aggregate function, e.g. group_concat
          wrapped_in_parenthesis(
            seq(
              optional($.keyword_distinct),
              field('parameter', $.term),
              optional($.order_by),
              optional(seq(
                choice($.keyword_separator, ','),
                alias($._literal_string, $.literal),
              )),
              optional($.limit),
            ),
          ),
        ),
        optional($.filter_expression),
        optional($.within_group),
      ),
    ),

    // ── :: type cast (Snowflake-specific; Postgres has same pattern) ─────────
    _colon_cast: $ => seq(
      $._expression,
      '::',
      $._type,
    ),

    // Snowflake-specific keywords (not ANSI)
    keyword_at:             _ => token(prec(1, make_keyword("at"))),
    keyword_one:            _ => token(prec(1, make_keyword("one"))),
    keyword_per:            _ => token(prec(1, make_keyword("per"))),
    keyword_past:           _ => token(prec(1, make_keyword("past"))),
    keyword_next:           _ => token(prec(1, make_keyword("next"))),
    keyword_match_recognize:_ => token(prec(1, make_keyword("match_recognize"))),
    keyword_measures:       _ => token(prec(1, make_keyword("measures"))),
    keyword_define:         _ => token(prec(1, make_keyword("define"))),
    keyword_skip:           _ => token(prec(1, make_keyword("skip"))),
    keyword_flatten:        _ => token(prec(1, make_keyword("flatten"))),
    keyword_let:            _ => token(prec(1, make_keyword("let"))),
    keyword_raise:          _ => token(prec(1, make_keyword("raise"))),
    keyword_exception:      _ => token(prec(1, make_keyword("exception"))),
    keyword_task:           _ => token(prec(1, make_keyword("task"))),
    keyword_stream:         _ => token(prec(1, make_keyword("stream"))),
    keyword_dynamic:        _ => token(prec(1, make_keyword("dynamic"))),
    keyword_warehouse:      _ => token(prec(1, make_keyword("warehouse"))),
    keyword_clone:             _ => token(prec(1, make_keyword("clone"))),
    keyword_optimization:      _ => token(prec(1, make_keyword("optimization"))),
    keyword_search:            _ => token(prec(1, make_keyword("search"))),
    keyword_recluster:         _ => token(prec(1, make_keyword("recluster"))),
    keyword_global:            _ => token(prec(1, make_keyword("global"))),
    keyword_transient:         _ => token(prec(1, make_keyword("transient"))),
    keyword_tags:              _ => token(prec(1, make_keyword("tags"))),
    keyword_tag:               _ => token(prec(1, make_keyword("tag"))),
    keyword_template:          _ => token(prec(1, make_keyword("template"))),
    keyword_autoincrement:     _ => token(prec(1, make_keyword("autoincrement"))),
    keyword_identity:          _ => token(prec(1, make_keyword("identity"))),
    keyword_noorder:           _ => token(prec(1, make_keyword("noorder"))),
    keyword_projection:        _ => token(prec(1, make_keyword("projection"))),
    keyword_aggregation:       _ => token(prec(1, make_keyword("aggregation"))),
    keyword_entity:            _ => token(prec(1, make_keyword("entity"))),
    keyword_allowed:           _ => token(prec(1, make_keyword("allowed"))),
    keyword_keys:              _ => token(prec(1, make_keyword("keys"))),
    keyword_lifecycle:         _ => token(prec(1, make_keyword("lifecycle"))),
    keyword_contact:           _ => token(prec(1, make_keyword("contact"))),
    keyword_try_cast: _ => token(prec(1, make_keyword("try_cast"))),
    keyword_failover: _ => token(prec(1, make_keyword("failover"))),
    keyword_edition: _ => token(prec(1, make_keyword("edition"))),
    keyword_feature: _ => token(prec(1, make_keyword("feature"))),
    keyword_virtual:           _ => token(prec(1, make_keyword("virtual"))),
    keyword_enforced:          _ => token(prec(1, make_keyword("enforced"))),
    keyword_rely:              _ => token(prec(1, make_keyword("rely"))),
    keyword_norely:            _ => token(prec(1, make_keyword("norely"))),
    keyword_validate:          _ => token(prec(1, make_keyword("validate"))),
    keyword_novalidate:        _ => token(prec(1, make_keyword("novalidate"))),
    keyword_undrop:            _ => token(prec(1, make_keyword("undrop"))),
    keyword_warehouse_size:    _ => token(prec(1, /[Ww][Aa][Rr][Ee][Hh][Oo][Uu][Ss][Ee]_[Ss][Ii][Zz][Ee]/)),
    keyword_max_cluster_count: _ => token(prec(1, /[Mm][Aa][Xx]_[Cc][Ll][Uu][Ss][Tt][Ee][Rr]_[Cc][Oo][Uu][Nn][Tt]/)),
    keyword_min_cluster_count: _ => token(prec(1, /[Mm][Ii][Nn]_[Cc][Ll][Uu][Ss][Tt][Ee][Rr]_[Cc][Oo][Uu][Nn][Tt]/)),
    keyword_scaling_policy:    _ => token(prec(1, /[Ss][Cc][Aa][Ll][Ii][Nn][Gg]_[Pp][Oo][Ll][Ii][Cc][Yy]/)),
    keyword_standard:          _ => token(prec(1, make_keyword("standard"))),
    keyword_economy:           _ => token(prec(1, make_keyword("economy"))),
    keyword_auto_suspend:      _ => token(prec(1, /[Aa][Uu][Tt][Oo]_[Ss][Uu][Ss][Pp][Ee][Nn][Dd]/)),
    keyword_auto_resume:       _ => token(prec(1, /[Aa][Uu][Tt][Oo]_[Rr][Ee][Ss][Uu][Mm][Ee]/)),
    keyword_suspend:           _ => token(prec(1, make_keyword("suspend"))),
    keyword_resume:            _ => token(prec(1, make_keyword("resume"))),
    keyword_abort:             _ => token(prec(1, make_keyword("abort"))),
    keyword_queries:           _ => token(prec(1, make_keyword("queries"))),
    keyword_schedule:       _ => token(prec(1, make_keyword("schedule"))),
    keyword_output:         _ => token(prec(1, make_keyword("output"))),
    keyword_caller:         _ => token(prec(1, make_keyword("caller"))),
    keyword_memoizable:     _ => token(prec(1, make_keyword("memoizable"))),
    keyword_aggregate:      _ => token(prec(1, make_keyword("aggregate"))),
    keyword_allowed_values: _ => token(prec(1, make_keyword("allowed_values"))),
    keyword_managed:        _ => token(prec(1, make_keyword("managed"))),
    keyword_alert: _ => token(prec(1, make_keyword("alert"))),
    keyword_suspended: _ => token(prec(1, make_keyword("suspended"))),
    keyword_condition: _ => token(prec(1, make_keyword("condition"))),
    keyword_frozen: _ => token(prec(1, make_keyword("frozen"))),
    keyword_authentication: _ => token(prec(1, make_keyword("authentication"))),
    keyword_application: _ => token(prec(1, make_keyword("application"))),
    keyword_package: _ => token(prec(1, make_keyword("package"))),
    keyword_compute: _ => token(prec(1, make_keyword("compute"))),
    keyword_pool: _ => token(prec(1, make_keyword("pool"))),
    keyword_cortex: _ => token(prec(1, make_keyword("cortex"))),
    keyword_service: _ => token(prec(1, make_keyword("service"))),
    keyword_dbt: _ => token(prec(1, make_keyword("dbt"))),
    keyword_project: _ => token(prec(1, make_keyword("project"))),
    keyword_dcm: _ => token(prec(1, make_keyword("dcm"))),
    keyword_event: _ => token(prec(1, make_keyword("event"))),
    keyword_volume: _ => token(prec(1, make_keyword("volume"))),
    keyword_hybrid: _ => token(prec(1, make_keyword("hybrid"))),
    keyword_iceberg: _ => token(prec(1, make_keyword("iceberg"))),
    keyword_mcp: _ => token(prec(1, make_keyword("mcp"))),
    keyword_server: _ => token(prec(1, make_keyword("server"))),
    keyword_model: _ => token(prec(1, make_keyword("model"))),
    keyword_network: _ => token(prec(1, make_keyword("network"))),
    keyword_rule: _ => token(prec(1, make_keyword("rule"))),
    keyword_notebook: _ => token(prec(1, make_keyword("notebook"))),
    keyword_resource: _ => token(prec(1, make_keyword("resource"))),
    keyword_monitor: _ => token(prec(1, make_keyword("monitor"))),
    keyword_semantic: _ => token(prec(1, make_keyword("semantic"))),
    keyword_share: _ => token(prec(1, make_keyword("share"))),
    keyword_streamlit: _ => token(prec(1, make_keyword("streamlit"))),
    keyword_alerts: _ => token(prec(1, make_keyword("alerts"))),
    keyword_applications: _ => token(prec(1, make_keyword("applications"))),
    keyword_pools: _ => token(prec(1, make_keyword("pools"))),
    keyword_connections: _ => token(prec(1, make_keyword("connections"))),
    keyword_services: _ => token(prec(1, make_keyword("services"))),
    keyword_projects: _ => token(prec(1, make_keyword("projects"))),
    keyword_volumes: _ => token(prec(1, make_keyword("volumes"))),
    keyword_accounts: _ => token(prec(1, make_keyword("accounts"))),
    keyword_servers: _ => token(prec(1, make_keyword("servers"))),
    keyword_rules: _ => token(prec(1, make_keyword("rules"))),
    keyword_objects: _ => token(prec(1, make_keyword("objects"))),
    keyword_regions: _ => token(prec(1, make_keyword("regions"))),
    keyword_replication: _ => token(prec(1, make_keyword("replication"))),
    keyword_monitors: _ => token(prec(1, make_keyword("monitors"))),
    keyword_shares: _ => token(prec(1, make_keyword("shares"))),
    keyword_streamlits: _ => token(prec(1, make_keyword("streamlits"))),
    keyword_variables: _ => token(prec(1, make_keyword("variables"))),
    keyword_workspaces: _ => token(prec(1, make_keyword("workspaces"))),
    keyword_imported: _ => token(prec(1, make_keyword("imported"))),
    keyword_metric: _ => token(prec(1, make_keyword("metric"))),
    keyword_identifier: _ => token(prec(1, make_keyword("identifier"))),
    keyword_result: _ => token(prec(1, make_keyword("result"))),
    keyword_future: _ => token(prec(1, make_keyword("future"))),
    keyword_deployments: _ => token(prec(1, make_keyword("deployments"))),
    keyword_history: _ => token(prec(1, make_keyword("history"))),
    keyword_name: _ => token(prec(1, make_keyword("name"))),
    keyword_snapshot: _ => token(prec(1, make_keyword("snapshot"))),
    keyword_ownership: _ => token(prec(1, make_keyword("ownership"))),
    keyword_operate: _ => token(prec(1, make_keyword("operate"))),
    keyword_audit: _ => token(prec(1, make_keyword("audit"))),
    keyword_evolve: _ => token(prec(1, make_keyword("evolve"))),
    keyword_attach: _ => token(prec(1, make_keyword("attach"))),
    keyword_apply: _ => token(prec(1, make_keyword("apply"))),
    keyword_packages: _ => token(prec(1, make_keyword("packages"))),
    keyword_bind: _ => token(prec(1, make_keyword("bind"))),
    keyword_endpoint: _ => token(prec(1, make_keyword("endpoint"))),
    keyword_import: _ => token(prec(1, make_keyword("import"))),
    keyword_manage: _ => token(prec(1, make_keyword("manage"))),
    keyword_execution: _ => token(prec(1, make_keyword("execution"))),
    keyword_override: _ => token(prec(1, make_keyword("override"))),
    keyword_restrictions: _ => token(prec(1, make_keyword("restrictions"))),
    keyword_reference: _ => token(prec(1, make_keyword("reference"))),
    keyword_purchase: _ => token(prec(1, make_keyword("purchase"))),
    keyword_exchange: _ => token(prec(1, make_keyword("exchange"))),
    keyword_listing: _ => token(prec(1, make_keyword("listing"))),
    keyword_backup: _ => token(prec(1, make_keyword("backup"))),
    keyword_references: _ => token(prec(1, make_keyword("references"))),
    keyword_error_table: _ => token(prec(1, make_keyword("error_table"))),
    keyword_tabular: _ => token(prec(1, make_keyword("tabular"))),
    keyword_text: _ => token(prec(1, make_keyword("text"))),
    keyword_top: _ => token(prec(1, make_keyword("top"))),
    keyword_sample: _ => token(prec(1, make_keyword("sample"))),
    keyword_block: _ => token(prec(1, make_keyword("block"))),
    keyword_fields: _ => token(prec(1, make_keyword("fields"))),
    keyword_repeatable: _ => token(prec(1, make_keyword("repeatable"))),
    keyword_seed: _ => token(prec(1, make_keyword("seed"))),
    keyword_append_only: _ => token(prec(1, make_keyword("append_only"))),
    keyword_changes: _ => token(prec(1, make_keyword("changes"))),
    keyword_information: _ => token(prec(1, make_keyword("information"))),
    keyword_directed: _ => token(prec(1, make_keyword("directed"))),
    keyword_asof: _ => token(prec(1, make_keyword("asof"))),
    keyword_match_condition: _ => token(prec(1, make_keyword("match_condition"))),
    keyword_minus: _ => token(prec(1, make_keyword("minus"))),
    keyword_interactive: _ => token(prec(1, make_keyword("interactive"))),
    keyword_require: _ => token(prec(1, make_keyword("require"))),
    keyword_backfill: _ => token(prec(1, make_keyword("backfill"))),
    keyword_enroll: _ => token(prec(1, make_keyword("enroll"))),
    keyword_mfa: _ => token(prec(1, make_keyword("mfa"))),
    keyword_method: _ => token(prec(1, make_keyword("method"))),
    keyword_delegated: _ => token(prec(1, make_keyword("delegated"))),
    keyword_authorizations: _ => token(prec(1, make_keyword("authorizations"))),
    keyword_final: _ => token(prec(1, make_keyword("final"))),
    keyword_running: _ => token(prec(1, make_keyword("running"))),
    keyword_empty: _ => token(prec(1, make_keyword("empty"))),
    keyword_matches: _ => token(prec(1, make_keyword("matches"))),
    keyword_omit: _ => token(prec(1, make_keyword("omit"))),
    keyword_unmatched: _ => token(prec(1, make_keyword("unmatched"))),
    keyword_permute: _ => token(prec(1, make_keyword("permute"))),
    keyword_resultset: _ => token(prec(1, make_keyword("resultset"))),
    keyword_async: _ => token(prec(1, make_keyword("async"))),
    keyword_elseif: _ => token(prec(1, make_keyword("elseif"))),
    keyword_loop: _ => token(prec(1, make_keyword("loop"))),
    keyword_while: _ => token(prec(1, make_keyword("while"))),
    keyword_reverse: _ => token(prec(1, make_keyword("reverse"))),
    keyword_repeat: _ => token(prec(1, make_keyword("repeat"))),
    keyword_break: _ => token(prec(1, make_keyword("break"))),
    keyword_exit: _ => token(prec(1, make_keyword("exit"))),
    keyword_iterate: _ => token(prec(1, make_keyword("iterate"))),
    keyword_open: _ => token(prec(1, make_keyword("open"))),
    keyword_close: _ => token(prec(1, make_keyword("close"))),
    keyword_await: _ => token(prec(1, make_keyword("await"))),
    keyword_cancel: _ => token(prec(1, make_keyword("cancel"))),
    keyword_other: _ => token(prec(1, make_keyword("other"))),
    keyword_dry_run: _ => token(prec(1, make_keyword("dry_run"))),
    keyword_retry: _ => token(prec(1, make_keyword("retry"))),
    keyword_graph: _ => token(prec(1, make_keyword("graph"))),
    keyword_run: _ => token(prec(1, make_keyword("run"))),
    keyword_config: _ => token(prec(1, make_keyword("config"))),
    keyword_subpath: _ => token(prec(1, make_keyword("subpath"))),
    keyword_connect_by_root: _ => token(prec(1, make_keyword("connect_by_root"))),
    keyword_metrics: _ => token(prec(1, make_keyword("metrics"))),
    keyword_dimensions: _ => token(prec(1, make_keyword("dimensions"))),
    keyword_facts: _ => token(prec(1, make_keyword("facts"))),
    keyword_semantic_view: _ => token(prec(1, make_keyword("semantic_view"))),
    keyword_body: _ => token(prec(1, make_keyword("body"))),
    keyword_movement: _ => token(prec(1, make_keyword("movement"))),
    keyword_indexing: _ => token(prec(1, make_keyword("indexing"))),
    keyword_storage_location: _ => token(prec(1, make_keyword("storage_location"))),
    keyword_notify: _ => token(prec(1, make_keyword("notify"))),
    keyword_triggers: _ => token(prec(1, make_keyword("triggers"))),
    keyword_pull: _ => token(prec(1, make_keyword("pull"))),
    keyword_person: _ => token(prec(1, make_keyword("person"))),
    keyword_suspend_immediate: _ => token(prec(1, make_keyword("suspend_immediate"))),
    keyword_respect: _ => token(prec(1, make_keyword("respect"))),
    keyword_replica: _ => token(prec(1, make_keyword("replica"))),
    keyword_insufficient: _ => token(prec(1, make_keyword("insufficient"))),
    keyword_retention: _ => token(prec(1, make_keyword("retention"))),
    keyword_internal: _ => token(prec(1, make_keyword("internal"))),
    keyword_simple: _ => token(prec(1, make_keyword("simple"))),
    keyword_partial: _ => token(prec(1, make_keyword("partial"))),
    keyword_ls: _ => token(prec(1, make_keyword("ls"))),
    keyword_class: _ => token(prec(1, make_keyword("class"))),
    keyword_specification: _ => token(prec(1, make_keyword("specification"))),
    keyword_workspace: _ => token(prec(1, make_keyword("workspace"))),
    keyword_rm: _ => token(prec(1, make_keyword("rm"))),
    keyword_secure:         _ => token(prec(1, make_keyword("secure"))),
    keyword_masking:        _ => token(prec(1, make_keyword("masking"))),
    keyword_target_lag:     _ => token(prec(1, make_keyword("target_lag"))),
    keyword_access:         _ => token(prec(1, make_keyword("access"))),
    keyword_secondary:      _ => token(prec(1, make_keyword("secondary"))),
    keyword_roles:          _ => token(prec(1, make_keyword("roles"))),
    keyword_source:         _ => token(prec(1, make_keyword("source"))),
    keyword_qualify:        _ => token(prec(1, make_keyword("qualify"))),
    keyword_pivot:          _ => token(prec(1, make_keyword("pivot"))),
    keyword_unpivot:        _ => token(prec(1, make_keyword("unpivot"))),
    keyword_string:         _ => token(prec(1, make_keyword("string"))),
    keyword_rlike:          _ => token(prec(1, choice(make_keyword("rlike"), make_keyword("regexp")))),
    keyword_copy:           _ => token(prec(1, make_keyword("copy"))),
    keyword_policy:         _ => token(prec(1, make_keyword("policy"))),
    keyword_declare:        _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:         _ => token(prec(1, make_keyword("cursor"))),
    keyword_match:          _ => token(prec(1, make_keyword("match"))),
    keyword_stage:          _ => token(prec(1, make_keyword("stage"))),
    keyword_url:            _ => token(prec(1, make_keyword("url"))),
    keyword_credentials:    _ => token(prec(1, make_keyword("credentials"))),
    keyword_file_format:    _ => token(prec(1, /[Ff][Ii][Ll][Ee]_[Ff][Oo][Rr][Mm][Aa][Tt]/)),
    keyword_copy_options:   _ => token(prec(1, /[Cc][Oo][Pp][Yy]_[Oo][Pp][Tt][Ii][Oo][Nn][Ss]/)),
    keyword_directory:      _ => token(prec(1, make_keyword("directory"))),
    keyword_encryption:     _ => token(prec(1, make_keyword("encryption"))),
    keyword_pattern:        _ => token(prec(1, make_keyword("pattern"))),
    keyword_list:           _ => token(prec(1, make_keyword("list"))),
    keyword_call:           _ => token(prec(1, make_keyword("call"))),
    keyword_overwrite:      _ => token(prec(1, make_keyword("overwrite"))),
    keyword_location:       _ => token(prec(1, make_keyword("location"))),
    keyword_cluster:        _ => token(prec(1, make_keyword("cluster"))),
    keyword_clustering:     _ => token(prec(1, make_keyword("clustering"))),

    // SHOW / DESCRIBE keywords
    keyword_show:           _ => token(prec(1, make_keyword("show"))),
    keyword_terse:          _ => token(prec(1, make_keyword("terse"))),
    keyword_grants:         _ => token(prec(1, make_keyword("grants"))),
    keyword_users:          _ => token(prec(1, make_keyword("users"))),
    keyword_pipes:          _ => token(prec(1, make_keyword("pipes"))),
    keyword_integrations:   _ => token(prec(1, make_keyword("integrations"))),
    keyword_transactions:   _ => token(prec(1, make_keyword("transactions"))),
    keyword_locks:          _ => token(prec(1, make_keyword("locks"))),
    keyword_starts:         _ => token(prec(1, make_keyword("starts"))),
    keyword_account:        _ => token(prec(1, make_keyword("account"))),
    keyword_describe:       _ => token(prec(1, make_keyword("describe"))),
    keyword_desc:           _ => token(prec(1, make_keyword("desc"))),
    keyword_file:           _ => token(prec(1, make_keyword("file"))),
    keyword_format:         _ => token(prec(1, make_keyword("format"))),
    keyword_formats:        _ => token(prec(1, make_keyword("formats"))),
    keyword_pipe:           _ => token(prec(1, make_keyword("pipe"))),
    keyword_integration:    _ => token(prec(1, make_keyword("integration"))),
    keyword_parameters:     _ => token(prec(1, make_keyword("parameters"))),
    keyword_views:          _ => token(prec(1, make_keyword("views"))),
    keyword_columns:        _ => token(prec(1, make_keyword("columns"))),
    keyword_schemas:        _ => token(prec(1, make_keyword("schemas"))),
    keyword_databases:      _ => token(prec(1, make_keyword("databases"))),
    keyword_warehouses:     _ => token(prec(1, make_keyword("warehouses"))),
    keyword_stages:         _ => token(prec(1, make_keyword("stages"))),
    keyword_streams:        _ => token(prec(1, make_keyword("streams"))),
    keyword_tasks:          _ => token(prec(1, make_keyword("tasks"))),
    keyword_functions:      _ => token(prec(1, make_keyword("functions"))),
    keyword_procedures:     _ => token(prec(1, make_keyword("procedures"))),
    keyword_sequences:      _ => token(prec(1, make_keyword("sequences"))),
    keyword_policies:       _ => token(prec(1, make_keyword("policies"))),

    // Staged-file commands (PUT/GET/REMOVE/COPY FILES). `files` sits at the
    // same precedence as `file` so match length (not precedence) decides
    // between them.
    keyword_put:            _ => token(prec(1, make_keyword("put"))),
    keyword_get:            _ => token(prec(1, make_keyword("get"))),
    keyword_remove:         _ => token(prec(1, make_keyword("remove"))),
    keyword_files:          _ => token(prec(1, make_keyword("files"))),
    keyword_unset:          _ => token(prec(1, make_keyword("unset"))),
    keyword_swap:           _ => token(prec(1, make_keyword("swap"))),
    keyword_purge:          _ => token(prec(1, make_keyword("purge"))),

    // ── Spread all Snowflake rule modules ───────────────────────────────────
    ...qualify_rules,
    ...pivot_rules,
    ...match_rec_rules,
    ...time_travel_rules,
    ...variant_rules,
    ...scripting_rules,
    ...execute_rules,
    ...object_keyword_rules,
    ...create_platform_rules,
    ...alter_platform_rules,
    ...copy_rules,
    ...create_rules,
    ...create_table_rules,
    ...alter_table_rules,
    ...type_rules,
    ...alter_rules,
    ...use_rules,
    ...stage_rules,
    ...object_statement_rules,
    ...grant_rules,
    ...query_extra_rules,
    ...create_object_rules,
    ...misc_statement_rules,
    ...expression_extra_rules,
    ...alter_other_rules,
    ...files_rules,
    // last, so its overrides win over the inherited rules
    ...snowflake_property_rules,
    ...create_routine_rules,
    ...alter_object_rules,
    // Snowflake identifiers may contain `$` after the first character (SYSTEM$TYPEOF, METADATA$FILENAME).
    _identifier: _ => /[A-Za-z_\u00C0-\u017F][0-9A-Za-z_$\u00C0-\u017F]*/,
    _literal_string: $ => prec(1, choice($._single_quote_string, $._dollar_quoted_string)),

    // Single-quoted strings take backslash escapes ('it\'s') as well as doubled quotes.
    _single_quote_string: _ => seq(
      /([uU]&|[nN])?'([^'\\]|''|\\[\s\S])*'/,
      repeat(/'([^'\\]|''|\\[\s\S])*'/),
    ),
    // Double-quoted identifiers take doubled quotes ("a""b").
    _double_quote_string: _ => /"([^"]|"")*"/,
    // Exponent markers are case-insensitive: 1.234E2, 15e-03.
    _integer: _ => seq(
      optional(choice('-', '+')),
      /(0[xX][0-9A-Fa-f]+(_[0-9A-Fa-f]+)*)|(0[oO][0-7]+(_[0-7]+)*)|(0[bB][01]+(_[01]+)*)|(\d+(_\d+)*([eE][+-]?\d+(_\d+)*)?)/,
    ),
    _decimal_number: _ => seq(
      optional(choice('-', '+')),
      /((\d+(_\d+)*)?[.]\d+(_\d+)*([eE][+-]?\d+(_\d+)*)?)|(\d+(_\d+)*[.](\d+(_\d+)*)?[eE][+-]?\d+(_\d+)*)/,
    ),

    // IDENTIFIER('db.s.t') / IDENTIFIER($var) / IDENTIFIER(:bind): a name resolved at run time.
    identifier: $ => choice(
      $._identifier,
      $.dynamic_identifier,
      $.dynamic_composite_identifier,
      $._double_quote_string,
      $.identifier_function,
    ),
    identifier_function: $ => seq(
      $.keyword_identifier,
      '(',
      choice(
        alias($._literal_string, $.literal),
        alias($._integer, $.literal),
        seq($.parameter, repeat(seq('.', $.identifier))),
        $.bind_variable,
      ),
      ')',
    ),


    // Lexer-precedence guards: this dialect declares token(prec(1)) keywords
    // that are strict prefixes of the base keywords below. Explicit precedence
    // beats match length in the tree-sitter lexer, so without an equal-prec
    // re-declaration the longer keyword becomes unlexable in this dialect.
    keyword_attribute: _ => token(prec(1, make_keyword("attribute"))),
    keyword_atomic: _ => token(prec(1, make_keyword("atomic"))),
    keyword_called: _ => token(prec(1, make_keyword("called"))),
    keyword_definer: _ => token(prec(1, make_keyword("definer"))),
    keyword_matched: _ => token(prec(1, make_keyword("matched"))),
    keyword_percent: _ => token(prec(1, make_keyword("percent"))),

  },
}));
