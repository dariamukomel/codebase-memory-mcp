import base from '../grammar.js';
import { comma_list, optional_parenthesis, paren_list, wrapped_in_parenthesis, make_keyword, canonicalOrder } from '../grammar/helpers.js';
import { fromClause } from '../grammar/statements/select.js';
import pg_copy_rules from './grammar/copy.js';
import pg_optimize_rules from './grammar/optimize.js';
import pg_create_rules from './grammar/create.js';
import pg_alter_rules from './grammar/alter.js';
import pg_drop_rules from './grammar/drop.js';
import pg_replication_rules from './grammar/replication.js';
import pg_partition_rules from './grammar/partition.js';
import pg_notify_rules from './grammar/notify.js';
import pg_statement_rules from './grammar/statements.js';
import pg_maintenance_rules from './grammar/maintenance.js';
import pg_object_rules from './grammar/objects.js';
import dialect_transaction_rules from './grammar/transactions.js';
import dialect_alter_rules from './grammar/alter_vendor.js';
import dialect_legacy_rules from './grammar/legacy_statements.js';

export default canonicalOrder(grammar(base, {
  name: 'postgres_sql',

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
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

  externals: ($, previous) => [
    ...previous,
    $._dollar_quoted_string_start_tag,
    $._dollar_quoted_string_end_tag,
    $._dollar_quoted_string,
  ],

  rules: {
    ...dialect_transaction_rules,
    ...dialect_alter_rules,
    ...dialect_legacy_rules,


    // LIMIT is supported: fromClause with limit re-adds it over the ANSI base.
    from: $ => fromClause($, { limit: true }),

    // PostgreSQL: EXPLAIN [ANALYZE] [VERBOSE] | EXPLAIN ( option [, ...] )
    statement: $ => seq(
      optional(seq(
        $.keyword_explain,
        optional(choice(
          seq($.keyword_analyze, optional($.keyword_verbose)),
          $.keyword_verbose,
          $.explain_options,
        )),
      )),
      choice(
        $._ddl_statement,
        $._dml_write,
        optional_parenthesis($._dml_read),
        $._transaction_statement,
        $.declare_cursor_statement,
      ),
    ),

    // PostgreSQL: DECLARE name [BINARY] [[NO] SCROLL] CURSOR [{WITH|WITHOUT} HOLD]
    // FOR query (ISO E121). PL/pgSQL DECLARE lives inside function-body strings,
    // so a top-level DECLARE is unambiguously a cursor declaration.
    declare_cursor_statement: $ => seq(
      $.keyword_declare,
      field('name', $.identifier),
      optional($.keyword_binary),
      optional(seq(optional($.keyword_no), $.keyword_scroll)),
      $.keyword_cursor,
      optional(seq(choice($.keyword_with, $.keyword_without), $.keyword_hold)),
      $.keyword_for,
      $._dml_read,
    ),

    _dml_write: $ => seq(
      optional($._cte),
      choice(
        $._delete_statement,
        $._insert_statement,
        $._update_statement,
        $._truncate_statement,
        $._copy_statement,
      ),
    ),

    // PostgreSQL: INSERT supports ON CONFLICT and RETURNING
    _insert_statement: $ => seq(
      $.insert,
      optional($.returning),
    ),

    insert: $ => seq(
      $.keyword_insert,
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

    // PostgreSQL: DELETE supports RETURNING
    _delete_statement: $ => seq(
      $.delete,
      alias($._delete_from, $.from),
      optional($.returning),
    ),

    // PostgreSQL: UPDATE supports RETURNING
    _update_statement: $ => seq(
      $.update,
      optional($.returning),
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
        $.create_extension,
        $.create_domain,
        $.create_cast,
        $.create_server,
        $.create_foreign_table,
        $.create_trigger,
        $.create_policy,
        $.create_publication,
        $.create_subscription,
        $.create_aggregate_statement,
        prec.left(seq(
          $.create_schema,
          repeat($._create_statement),
        )),
      ),
    ),

    create_table: $ => prec.left(
      seq(
        $.keyword_create,
        optional(
          choice(
            $._temporary,
            $.keyword_unlogged,
          )
        ),
        $.keyword_table,
        optional($._if_not_exists),
        field("target", $.object_reference),
        choice(
          // PARTITION OF parent [FOR VALUES spec | DEFAULT]
          seq(
            $.keyword_partition,
            $.keyword_of,
            $.object_reference,
            optional(choice($.partition_bound, $.keyword_default)),
          ),
          // Regular table body: optional column_definitions or (LIKE parent)
          seq(
            optional(
              choice(
                $.column_definitions,
                seq('(', $.like_clause, ')'),
              ),
            ),
            optional(seq($.keyword_as, $.create_query)),
            optional($.inherits_clause),
            optional($.table_partition_by),
          ),
        ),
      ),
    ),

    create_index: $ => seq(
      $.keyword_create,
      optional($.keyword_unique),
      $.keyword_index,
      optional($.keyword_concurrently),
      optional(
        seq(
          optional($._if_not_exists),
          field('column', $._column),
        ),
      ),
      $.keyword_on,
      optional($.keyword_only),
      seq(
        $.object_reference,
        optional(
          seq(
            $.keyword_using,
            choice(
              $.keyword_btree,
              $.keyword_hash,
              $.keyword_gist,
              $.keyword_spgist,
              $.keyword_gin,
              $.keyword_brin,
              field('index_type', $.identifier),
            ),
          ),
        ),
        $.index_fields,
      ),
      optional($.covering_columns),
      optional($.tablespace),
      optional($.where),
    ),

    _optimize_statement: $ => $._vacuum_table,

    _alter_statement: $ => seq(
      choice(
        $.alter_table,
        $.alter_view,
        $.alter_materialized_view,
        $.alter_schema,
        $.alter_type,
        $.alter_index,
        $.alter_database,
        $.alter_role,
        $.alter_sequence,
        $.alter_policy,
        $.alter_publication,
      ),
    ),

    _drop_statement: $ => seq(
      choice(
        $.drop_table,
        $.drop_view,
        $.drop_materialized_view,
        $.drop_index,
        $.drop_type,
        $.drop_schema,
        $.drop_database,
        $.drop_role,
        $.drop_sequence,
        $.drop_extension,
        $.drop_function,
        $.drop_procedure,
        $.drop_publication,
        $.drop_subscription,
      ),
    ),

    _postgres_escape_string: _ => /(e|E)'([^']|\\')*'/,

    _literal_string: $ => prec(
      1,
      choice(
        $._single_quote_string,
        $._postgres_escape_string,
        $._dollar_quoted_string,
      ),
    ),

    _expression: $ => prec(1,
      choice(
        $.literal,
        $.position_expression,
        alias($._qualified_field, $.field),
        $.parameter,
        $.list,
        $.case,
        $.window_function,
        $.subquery,
        $.cast,
        alias($.implicit_cast, $.cast),
        $.exists,
        $.invocation,
        $.binary_expression,
        $.subscript,
        $.unary_expression,
        $.array,
        $.interval,
        $.between_expression,
        $.parenthesized_expression,
        $.object_id,
        // Inherited from base but this dialect fully re-enumerates
        // _expression, so it must be re-added explicitly: LIKE/NOT LIKE now
        // parse exclusively through like_expression (with optional ESCAPE),
        // not through binary_expression's operator table below.
        $.like_expression,
        // ANSI typed temporal literal (F051-03): DATE/TIME/TIMESTAMP '…'.
        // Re-added for the same reason; the re-enumeration replaces the base
        // _expression wholesale.
        $.typed_temporal_literal,
      ),
    ),

    // PostgreSQL: add ILIKE / NOT ILIKE to the base operator table
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
        [$.keyword_ilike, 'pattern_matching'],
        [$.not_ilike, 'pattern_matching'],
        [$.keyword_rlike, 'pattern_matching'],
        [$.not_rlike, 'pattern_matching'],
        [$.similar_to, 'pattern_matching'],
        [$.not_similar_to, 'pattern_matching'],
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

    not_ilike: $ => seq($.keyword_not, $.keyword_ilike),

    implicit_cast: $ => seq(
      $._expression,
      '::',
      $._type,
    ),

    object_id: $ => seq(
      $.keyword_object_id,
      wrapped_in_parenthesis(
        seq(
          alias($._literal_string, $.literal),
          optional(
            seq(
              ',',
              alias($._literal_string, $.literal),
            ),
          ),
        ),
      ),
    ),

    _ddl_statement: $ => choice(
      $._create_statement,
      $._alter_statement,
      $._drop_statement,
      $._rename_statement,
      $._optimize_statement,
      $._merge_statement,
      $._refresh_statement,
      $.set_statement,
      $.reset_statement,
      $.comment_statement,
      $._show_statement,
      $.do_statement,
      $.grant_statement,
      $.revoke_statement,
      $.listen_statement,
      $.notify_statement,
      $.unlisten_statement,
      $.lock_table_statement,
      $.call_statement,
      $.prepare_statement,
      $.execute_statement,
      $.deallocate_statement,
      // Maintenance / utility statements
      $.reindex_statement,
      $.cluster_statement,
      $.checkpoint_statement,
      $.discard_statement,
      $.load_statement,
      $.close_statement,
      $.abort_statement,
      $.end_statement,
      $.move_statement,
      // Object-definition statements
      $.security_label_statement,
      $.reassign_owned_statement,
      $.import_foreign_schema_statement,
      $.create_collation_statement,
      $.create_conversion_statement,
      $.create_access_method_statement,
      $.create_transform_statement,
      $.create_event_trigger_statement,
      $.create_operator_statement,
      $.alter_operator_statement,
      $.create_rule_statement,
      $.alter_rule_statement,
      $.alter_collation_statement,
      $.alter_conversion_statement,
      $.alter_event_trigger_statement,
    ),

    // PostgreSQL: DO $$ ... $$ anonymous block
    do_statement: $ => seq(
      $.keyword_do,
      optional(seq($.keyword_language, $.identifier)),
      $._dollar_quoted_string,
    ),

    // PostgreSQL: override cte to add SEARCH/CYCLE clauses (PG 14+)
    cte: $ => seq(
      field('name', $.identifier),
      optional(paren_list(field('argument', $.identifier))),
      $.keyword_as,
      optional(seq(
        optional($.keyword_not),
        $.keyword_materialized,
      )),
      field('body', wrapped_in_parenthesis(
        alias(
          choice($._dml_read, $._dml_write),
          $.statement,
        ),
      )),
      optional($._cte_search_clause),
      optional($._cte_cycle_clause),
    ),

    _cte_search_clause: $ => seq(
      $.keyword_search,
      choice($.keyword_breadth, $.keyword_depth),
      $.keyword_first,
      $.keyword_by,
      comma_list($.identifier, true),
      $.keyword_set,
      $.identifier,
    ),

    _cte_cycle_clause: $ => seq(
      $.keyword_cycle,
      comma_list($.identifier, true),
      $.keyword_set,
      $.identifier,
      $.keyword_default,
      $._expression,
      $.keyword_using,
      $.identifier,
    ),

    // PostgreSQL: override _column_constraint to add GENERATED AS IDENTITY
    _column_constraint: $ => prec.left(choice(
      choice(
        $.keyword_null,
        $._not_null,
      ),
      seq(
        $.keyword_references,
        $.object_reference,
        paren_list($.identifier, true),
        repeat(
          seq(
            $.keyword_on,
            choice($.keyword_delete, $.keyword_update),
            choice(
              seq($.keyword_no, $.keyword_action),
              $.keyword_restrict,
              $.keyword_cascade,
              seq(
                $.keyword_set,
                choice($.keyword_null, $.keyword_default),
                optional(paren_list($.identifier, true)),
              ),
            ),
          ),
        ),
      ),
      $._default_expression,
      $._primary_key,
      $.direction,
      $._column_comment,
      $._check_constraint,
      // Computed generated column: GENERATED ALWAYS AS (expr) STORED
      // Expression MUST be parenthesized to avoid ambiguity with IDENTITY column.
      seq(
        optional(seq($.keyword_generated, $.keyword_always)),
        $.keyword_as,
        wrapped_in_parenthesis($._expression),
      ),
      // Identity column: GENERATED {ALWAYS|BY DEFAULT} AS IDENTITY [(opts)]
      seq(
        $.keyword_generated,
        choice(
          $.keyword_always,
          seq($.keyword_by, $.keyword_default),
        ),
        $.keyword_as,
        $.keyword_identity,
        optional(wrapped_in_parenthesis(
          repeat1(choice(
            seq($.keyword_start, optional($.keyword_with), alias($._integer, $.literal)),
            seq($.keyword_increment, optional($.keyword_by), alias($._integer, $.literal)),
            seq($.keyword_minvalue, alias($._integer, $.literal)),
            seq($.keyword_maxvalue, alias($._integer, $.literal)),
            seq($.keyword_no, choice($.keyword_minvalue, $.keyword_maxvalue, $.keyword_cycle)),
            $.keyword_cycle,
          )),
        )),
      ),
      $.keyword_unique,
    )),

    set_statement: $ => seq(
      $.keyword_set,
      choice(
        seq($.keyword_constraints, choice($.keyword_all, $.identifier), choice($.keyword_deferred, $.keyword_immediate)),
        seq($.keyword_transaction, $._transaction_mode),
        seq($.keyword_transaction, $.keyword_snapshot, $._transaction_mode),
        seq($.keyword_session, $.keyword_characteristics, $.keyword_as, $.keyword_transaction, $._transaction_mode),
        seq(
          $.object_reference,
          choice(
            seq('=', choice($.literal, $.keyword_on, $.keyword_off, $.identifier)),
            seq($.keyword_to, choice($.literal, $.keyword_default, $.keyword_on, $.keyword_off, $.identifier)),
          ),
        ),
      ),
    ),

    reset_statement: $ => seq(
      $.keyword_reset,
      choice(
        $.object_reference,
        $.keyword_all,
        seq($.keyword_session, $.keyword_authorization),
        $.keyword_role,
      ),
    ),

    use_statement: $ => seq(
      $.keyword_use,
      optional($.keyword_schema),
      $.object_reference,
    ),

    _show_statement: $ => seq(
      $.keyword_show,
      choice(
        seq($.keyword_create, choice($.keyword_table, $.keyword_view, $.keyword_schema, $.keyword_user), $.object_reference),
        $.keyword_all,
        seq($.keyword_tables, optional(seq($.keyword_from, $.object_reference)), optional(seq($.keyword_like, alias($._literal_string, $.literal)))),
        $.object_reference,
      ),
    ),

    comment_statement: $ => seq(
      $.keyword_comment,
      $.keyword_on,
      $._comment_target,
      $.keyword_is,
      choice(
        $.keyword_null,
        alias($._literal_string, $.literal),
      ),
    ),

    _comment_target: $ => choice(
      $.cast,
      seq($.keyword_column, alias($._qualified_field, $.object_reference)),
      seq($.keyword_database, $.identifier),
      seq($.keyword_extension, $.object_reference),
      seq($.keyword_function, $.object_reference, optional($.function_arguments)),
      seq($.keyword_index, $.object_reference),
      seq($.keyword_materialized, $.keyword_view, $.object_reference),
      seq($.keyword_procedure, $.object_reference, optional($.function_arguments)),
      seq($.keyword_role, $.identifier),
      seq($.keyword_schema, $.identifier),
      seq($.keyword_sequence, $.object_reference),
      seq($.keyword_table, $.object_reference),
      seq($.keyword_tablespace, $.identifier),
      seq($.keyword_trigger, $.identifier, $.keyword_on, $.object_reference),
      seq($.keyword_type, $.identifier),
      seq($.keyword_view, $.object_reference),
    ),

    // PostgreSQL-specific keywords (not ANSI)
    keyword_aggregate:      _ => token(prec(1, make_keyword("aggregate"))),
    keyword_concurrently:   _ => token(prec(1, make_keyword("concurrently"))),
    keyword_btree:          _ => token(prec(1, make_keyword("btree"))),
    keyword_hash:           _ => token(prec(1, make_keyword("hash"))),
    keyword_gist:           _ => token(prec(1, make_keyword("gist"))),
    keyword_spgist:         _ => token(prec(1, make_keyword("spgist"))),
    keyword_gin:            _ => token(prec(1, make_keyword("gin"))),
    keyword_brin:           _ => token(prec(1, make_keyword("brin"))),
    keyword_unlogged:       _ => token(prec(1, make_keyword("unlogged"))),
    keyword_logged:         _ => token(prec(1, make_keyword("logged"))),
    keyword_extension:      _ => token(prec(1, make_keyword("extension"))),
    keyword_domain:         _ => token(prec(1, make_keyword("domain"))),
    keyword_assignment:     _ => token(prec(1, make_keyword("assignment"))),
    keyword_implicit:       _ => token(prec(1, make_keyword("implicit"))),
    keyword_server:         _ => token(prec(1, make_keyword("server"))),
    keyword_wrapper:        _ => token(prec(1, make_keyword("wrapper"))),
    keyword_options:        _ => token(prec(1, make_keyword("options"))),
    keyword_policy:         _ => token(prec(1, make_keyword("policy"))),
    keyword_permissive:     _ => token(prec(1, make_keyword("permissive"))),
    keyword_restrictive:    _ => token(prec(1, make_keyword("restrictive"))),
    keyword_vacuum:         _ => token(prec(1, make_keyword("vacuum"))),
    keyword_copy:           _ => token(prec(1, make_keyword("copy"))),
    keyword_stdin:          _ => token(prec(1, make_keyword("stdin"))),
    keyword_stdout:         _ => token(prec(1, make_keyword("stdout"))),
    keyword_freeze:         _ => token(prec(1, make_keyword("freeze"))),
    keyword_escape:         _ => token(prec(1, make_keyword("escape"))),
    keyword_encoding:       _ => token(prec(1, make_keyword("encoding"))),
    keyword_force_quote:    _ => token(prec(1, make_keyword("force_quote"))),
    keyword_quote:          _ => token(prec(1, make_keyword("quote"))),
    keyword_force_null:     _ => token(prec(1, make_keyword("force_null"))),
    keyword_force_not_null: _ => token(prec(1, make_keyword("force_not_null"))),
    keyword_header:         _ => token(prec(1, make_keyword("header"))),
    keyword_program:        _ => token(prec(1, make_keyword("program"))),
    keyword_plain:          _ => token(prec(1, make_keyword("plain"))),
    keyword_extended:       _ => token(prec(1, make_keyword("extended"))),
    keyword_main:           _ => token(prec(1, make_keyword("main"))),
    keyword_storage:        _ => token(prec(1, make_keyword("storage"))),
    keyword_compression:    _ => token(prec(1, make_keyword("compression"))),
    keyword_returning:      _ => token(prec(1, make_keyword("returning"))),
    keyword_conflict:       _ => token(prec(1, make_keyword("conflict"))),
    keyword_upsert:         _ => token(prec(1, make_keyword("upsert"))),
    keyword_nowait:         _ => token(prec(1, make_keyword("nowait"))),
    // ATTACH follows the index name in ALTER INDEX and DEPENDS follows it in
    // ALTER INDEX / ALTER MATERIALIZED VIEW, both positions where an
    // identifier is still legal, so neither can stay extracted.
    keyword_attach:         _ => token(prec(1, make_keyword("attach"))),
    keyword_depends:        _ => token(prec(1, make_keyword("depends"))),
    keyword_wait:           _ => token(prec(1, make_keyword("wait"))),
    keyword_tablespace:     _ => token(prec(1, make_keyword("tablespace"))),
    keyword_replication:    _ => token(prec(1, make_keyword("replication"))),
    keyword_oid:            _ => token(prec(1, make_keyword("oid"))),
    keyword_oids:           _ => token(prec(1, make_keyword("oids"))),
    keyword_name:           _ => token(prec(1, make_keyword("name"))),
    keyword_regclass:       _ => token(prec(1, make_keyword("regclass"))),
    keyword_regnamespace:   _ => token(prec(1, make_keyword("regnamespace"))),
    keyword_regproc:        _ => token(prec(1, make_keyword("regproc"))),
    keyword_regtype:        _ => token(prec(1, make_keyword("regtype"))),
    keyword_publication:    _ => token(prec(1, make_keyword("publication"))),
    keyword_subscription:   _ => token(prec(1, make_keyword("subscription"))),
    keyword_search:         _ => token(prec(1, make_keyword("search"))),
    keyword_breadth:        _ => token(prec(1, make_keyword("breadth"))),
    keyword_depth:          _ => token(prec(1, make_keyword("depth"))),
    keyword_ilike:          _ => token(prec(1, make_keyword("ilike"))),
    keyword_setof:          _ => token(prec(1, make_keyword("setof"))),
    keyword_variadic:       _ => token(prec(1, make_keyword("variadic"))),
    keyword_leakproof:      _ => token(prec(1, make_keyword("leakproof"))),
    keyword_parallel:       _ => token(prec(1, make_keyword("parallel"))),
    keyword_safe:           _ => token(prec(1, make_keyword("safe"))),
    keyword_unsafe:         _ => token(prec(1, make_keyword("unsafe"))),
    keyword_restricted:     _ => token(prec(1, make_keyword("restricted"))),
    keyword_called:         _ => token(prec(1, make_keyword("called"))),
    keyword_strict:         _ => token(prec(1, make_keyword("strict"))),
    keyword_support:        _ => token(prec(1, make_keyword("support"))),
    keyword_cost:           _ => token(prec(1, make_keyword("cost"))),
    keyword_ordinality:     _ => token(prec(1, make_keyword("ordinality"))),
    keyword_attribute:      _ => token(prec(1, make_keyword("attribute"))),
    keyword_statistics:     _ => token(prec(1, make_keyword("statistics"))),
    keyword_format:         _ => token(prec(1, make_keyword("format"))),
    keyword_delimiter:      _ => token(prec(1, make_keyword("delimiter"))),
    keyword_csv:            _ => token(prec(1, make_keyword("csv"))),
    keyword_inherits:       _ => token(prec(1, make_keyword("inherits"))),
    keyword_including:      _ => token(prec(1, make_keyword("including"))),
    keyword_excluding:      _ => token(prec(1, make_keyword("excluding"))),
    keyword_indexes:        _ => token(prec(1, make_keyword("indexes"))),
    keyword_object_id:      _ => token(prec(1, make_keyword("object_id"))),
    keyword_list:           _ => token(prec(1, make_keyword("list"))),
    keyword_identity:       _ => token(prec(1, make_keyword("identity"))),
    keyword_show:           _ => token(prec(1, make_keyword("show"))),
    keyword_off:            _ => token(prec(1, make_keyword("off"))),
    // keyword_off's explicit prec(1) outranks the base keyword_offset token
    // (precedence beats match length in the lexer), which broke LIMIT … OFFSET.
    // Re-declare keyword_offset at the same precedence so longest-match wins.
    keyword_offset:         _ => token(prec(1, make_keyword("offset"))),
    keyword_match:          _ => token(prec(1, make_keyword("match"))),
    keyword_matched:        _ => token(prec(1, make_keyword("matched"))),
    keyword_version:        _ => token(prec(1, make_keyword("version"))),
    keyword_text:           _ => token(prec(1, make_keyword("text"))),
    keyword_current_user:   _ => token(prec(1, make_keyword("current_user"))),
    keyword_session_user:   _ => token(prec(1, make_keyword("session_user"))),
    keyword_current_role:   _ => token(prec(1, make_keyword("current_role"))),
    keyword_listen:         _ => token(prec(1, make_keyword("listen"))),
    keyword_notify:         _ => token(prec(1, make_keyword("notify"))),
    keyword_unlisten:       _ => token(prec(1, make_keyword("unlisten"))),
    // Maintenance / utility statements (see grammar/maintenance.js)
    keyword_reindex:        _ => token(prec(1, make_keyword("reindex"))),
    keyword_cluster:        _ => token(prec(1, make_keyword("cluster"))),
    keyword_checkpoint:     _ => token(prec(1, make_keyword("checkpoint"))),
    keyword_discard:        _ => token(prec(1, make_keyword("discard"))),
    keyword_plans:          _ => token(prec(1, make_keyword("plans"))),
    keyword_sequences:      _ => token(prec(1, make_keyword("sequences"))),
    keyword_load:           _ => token(prec(1, make_keyword("load"))),
    keyword_close:          _ => token(prec(1, make_keyword("close"))),
    keyword_abort:          _ => token(prec(1, make_keyword("abort"))),
    keyword_chain:          _ => token(prec(1, make_keyword("chain"))),
    keyword_move:           _ => token(prec(1, make_keyword("move"))),
    keyword_prior:          _ => token(prec(1, make_keyword("prior"))),
    keyword_absolute:       _ => token(prec(1, make_keyword("absolute"))),
    keyword_relative:       _ => token(prec(1, make_keyword("relative"))),
    keyword_forward:        _ => token(prec(1, make_keyword("forward"))),
    keyword_backward:       _ => token(prec(1, make_keyword("backward"))),
    // Object-definition statements (see grammar/objects.js)
    keyword_label:          _ => token(prec(1, make_keyword("label"))),
    keyword_reassign:       _ => token(prec(1, make_keyword("reassign"))),
    keyword_import:         _ => token(prec(1, make_keyword("import"))),
    keyword_collation:      _ => token(prec(1, make_keyword("collation"))),
    keyword_conversion:     _ => token(prec(1, make_keyword("conversion"))),
    keyword_method:         _ => token(prec(1, make_keyword("method"))),
    keyword_handler:        _ => token(prec(1, make_keyword("handler"))),
    keyword_transform:      _ => token(prec(1, make_keyword("transform"))),
    keyword_sql:            _ => token(prec(1, make_keyword("sql"))),
    keyword_event:          _ => token(prec(1, make_keyword("event"))),
    keyword_procedural:     _ => token(prec(1, make_keyword("procedural"))),
    keyword_large:          _ => token(prec(1, make_keyword("large"))),
    keyword_object:         _ => token(prec(1, make_keyword("object"))),
    keyword_routine:        _ => token(prec(1, make_keyword("routine"))),
    keyword_operator:       _ => token(prec(1, make_keyword("operator"))),
    keyword_rule:           _ => token(prec(1, make_keyword("rule"))),
    keyword_also:           _ => token(prec(1, make_keyword("also"))),
    keyword_replica:        _ => token(prec(1, make_keyword("replica"))),
    keyword_share:          _ => token(prec(1, make_keyword("share"))),
    keyword_lock:           _ => token(prec(1, make_keyword("lock"))),
    keyword_locked:         _ => token(prec(1, make_keyword("locked"))),
    keyword_skip:           _ => token(prec(1, make_keyword("skip"))),
    keyword_mode:           _ => token(prec(1, make_keyword("mode"))),
    keyword_access:         _ => token(prec(1, make_keyword("access"))),
    keyword_exclusive:      _ => token(prec(1, make_keyword("exclusive"))),
    keyword_prepare:        _ => token(prec(1, make_keyword("prepare"))),
    keyword_deallocate:     _ => token(prec(1, make_keyword("deallocate"))),
    keyword_call:           _ => token(prec(1, make_keyword("call"))),
    keyword_costs:          _ => token(prec(1, make_keyword("costs"))),
    keyword_settings:       _ => token(prec(1, make_keyword("settings"))),
    keyword_generic_plan:   _ => token(prec(1, make_keyword("generic_plan"))),
    keyword_buffers:        _ => token(prec(1, make_keyword("buffers"))),
    keyword_wal:            _ => token(prec(1, make_keyword("wal"))),
    keyword_timing:         _ => token(prec(1, make_keyword("timing"))),
    keyword_summary:        _ => token(prec(1, make_keyword("summary"))),
    keyword_yaml:           _ => token(prec(1, make_keyword("yaml"))),
    keyword_functions:      _ => token(prec(1, make_keyword("functions"))),
    keyword_procedures:     _ => token(prec(1, make_keyword("procedures"))),
    keyword_routines:       _ => token(prec(1, make_keyword("routines"))),
    keyword_declare:        _ => token(prec(1, make_keyword("declare"))),
    keyword_cursor:         _ => token(prec(1, make_keyword("cursor"))),
    keyword_scroll:         _ => token(prec(1, make_keyword("scroll"))),
    keyword_hold:           _ => token(prec(1, make_keyword("hold"))),

    ...pg_copy_rules,
    ...pg_optimize_rules,
    ...pg_create_rules,
    ...pg_alter_rules,
    ...pg_drop_rules,
    ...pg_replication_rules,
    ...pg_partition_rules,
    ...pg_notify_rules,
    ...pg_statement_rules,
    ...pg_maintenance_rules,
    ...pg_object_rules,

  },
}));
