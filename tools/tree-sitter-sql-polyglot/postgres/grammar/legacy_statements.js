import { make_keyword, comma_list, optional_parenthesis, paren_list, wrapped_in_parenthesis } from "../../grammar/helpers.js";
import create_function_rules from "../../grammar/statements/create-function.js";
import create_procedure_rules from "../../grammar/statements/create-procedure.js";

// The base grammar is ISO SQL. This is this dialect's own copy of the statement rules the base used
// to define before it was made ISO-only: CREATE / DROP / RENAME / REFRESH / TRUNCATE / INSERT /
// UPDATE / DELETE / MERGE with their vendor clauses (IF NOT EXISTS, OR REPLACE, TEMP, ON CONFLICT,
// ON DUPLICATE KEY, INSERT ... SET, multi-table UPDATE, ...). Spread first into `rules` so the
// dialect's own rules override it.

export function createStatementChoices($, { materializedView = false, index = false } = {}) {
  return [
    $.create_table,
    $.create_view,
    ...(materializedView ? [$.create_materialized_view] : []),
    ...(index ? [$.create_index] : []),
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
  ];
}

// Shared _create_statement choice builder. Base omits the non-ANSI
// CREATE MATERIALIZED VIEW and CREATE INDEX; dialects that support them pass
// { materializedView: true } / { index: true } from their own override instead
// of re-enumerating the whole choice.

const create_rules = {

  // Strict ANSI base: CREATE MATERIALIZED VIEW and CREATE INDEX are not ISO SQL;
  // dialects that support them opt in via createStatementChoices (below) in
  // their own _create_statement override. The rule definitions remain for reuse.
  _create_statement: $ => seq(
    choice(...createStatementChoices($)),
  ),

  // left precedence because 'quoted' table options otherwise conflict with
  // `create function` string bodies; if you remove this precedence you will
  // have to also disable the `_literal_string` choice for the `name` field
  // in =-assigned `table_option`s
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
    ),
  ),

  storage_parameters: $ => seq(
    $.keyword_with,
    paren_list(
      seq($.identifier, optional(seq('=', choice($.literal, $.array)))),
      true
    ),
  ),

  table_option: $ => choice(
    seq($.keyword_default, $.keyword_character, $.keyword_set, $.identifier),
    seq($.keyword_collate, $.identifier),
    field('name', $.keyword_default),
    seq(
      field('name', choice($.identifier, $._literal_string)),
      '=',
      field('value', choice($.identifier, $._literal_string, alias($._integer, $.literal))),
    ),
  ),

  create_query: $ => $._dml_read,

  create_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace),
      optional($._temporary),
      optional($.keyword_recursive),
      $.keyword_view,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional(paren_list($.identifier)),
      $.keyword_as,
      $.create_query,
      optional(
        seq(
          $.keyword_with,
          optional(
            choice(
              $.keyword_local,
              $.keyword_cascaded,
            )
          ),
          $._check_option,
        ),
      ),
    ),
  ),

  create_materialized_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($._or_replace),
      $.keyword_materialized,
      $.keyword_view,
      optional($._if_not_exists),
      $.object_reference,
      $.keyword_as,
      $.create_query,
      optional(
        choice(
          seq(
            $.keyword_with,
            $.keyword_data,
          ),
          seq(
            $.keyword_with,
            $.keyword_no,
            $.keyword_data,
          )
        )
      )
    ),
  ),

  _operator_class: $ => seq(
    field('opclass', $.identifier),
    optional(
      field('opclass_parameters', wrapped_in_parenthesis(comma_list($.term)))
    )
  ),

  composite_field: $ => seq(
    wrapped_in_parenthesis(
      comma_list(
        alias($._index_field, $.field),
        true,
      ),
    ),
    optional($.keyword_hash),
  ),

  _index_field: $ => seq(
    choice(
      field('expression', wrapped_in_parenthesis($._expression)),
      field('function', $.invocation),
      field('column', $._column),
    ),
    optional(seq($.keyword_collate, $.identifier)),
    optional($._operator_class),
    optional(choice($.keyword_hash, $.direction)),
    optional(
      seq(
        $.keyword_nulls,
        choice(
          $.keyword_first,
          $.keyword_last
        )
      )
    ),
  ),

  index_fields: $ => wrapped_in_parenthesis(
    comma_list(
      choice(
        $.composite_field,
        alias($._index_field, $.field),
      ),
      true,
    ),
  ),
  tablespace: $ => seq($.keyword_tablespace, $.identifier),

  covering_columns: $ => seq(
    $.keyword_include,
    $.index_fields,
  ),

  create_index: $ => seq(
    $.keyword_create,
    optional($.keyword_unique),
    $.keyword_index,
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
          field('index_type', $.identifier),
        ),
      ),
      $.index_fields
    ),
    optional($.covering_columns),
    optional($.tablespace),
    optional(
      $.where,
    ),
  ),

  ...create_function_rules,
  ...create_procedure_rules,

  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    choice(
      seq(
        optional($._if_not_exists),
        $.identifier,
        optional(seq($.keyword_authorization, $.identifier)),
      ),
      seq(
        $.keyword_authorization,
        $.identifier,
      ),
    ),
  )),

  _with_settings: $ => seq(
        field('name', $.identifier),
        optional('='),
        field('value', choice($.identifier, alias($._single_quote_string, $.literal))),
  ),

  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    $.identifier,
    optional($.keyword_with),
    repeat(
      $._with_settings
    ),
  )),

  create_role: $ => prec.left(seq(
    $.keyword_create,
    choice(
      $.keyword_user,
      $.keyword_role,
      $.keyword_group,
    ),
    $.identifier,
    optional($.keyword_with),
    repeat(
      choice(
        $._user_access_role_config,
        $._role_options,
      ),
    ),
  )),

  _role_options: $ => choice(
    field('option', $.identifier),
    seq(
      $.keyword_valid,
      $.keyword_until,
      field('valid_until', alias($._literal_string, $.literal))
    ),
    seq(
      $.keyword_connection,
      $.keyword_limit,
      field('connection_limit', alias($._integer, $.literal))
    ),
    seq(
      optional($.keyword_encrypted),
      $.keyword_password,
      choice(
        field('password', alias($._literal_string, $.literal)),
        $.keyword_null,
      ),
    ),
  ),

  _user_access_role_config: $ => seq(
    choice(
      seq(optional($.keyword_in), $.keyword_role),
      seq($.keyword_in, $.keyword_group),
      $.keyword_admin,
      $.keyword_user,
    ),
    comma_list($.identifier, true),
  ),

  create_sequence: $ => seq(
    $.keyword_create,
    optional(
      choice(
        choice($.keyword_temporary, $.keyword_temp),
        $.keyword_unlogged,
      )
    ),
    $.keyword_sequence,
    optional($._if_not_exists),
    field('target', $.object_reference),
    repeat(
      choice(
        seq($.keyword_as, $._type),
        seq($.keyword_increment, optional($.keyword_by), field('increment', alias($._integer, $.literal))),
        seq($.keyword_minvalue, choice($.literal, seq($.keyword_no, $.keyword_minvalue))),
        seq($.keyword_no, $.keyword_minvalue),
        seq($.keyword_maxvalue, choice($.literal, seq($.keyword_no, $.keyword_maxvalue))),
        seq($.keyword_no, $.keyword_maxvalue),
        seq($.keyword_start, optional($.keyword_with), field('start', alias($._integer, $.literal))),
        seq($.keyword_cache, field('cache', alias($._integer, $.literal))),
        seq(optional($.keyword_no), $.keyword_cycle),
        seq($.keyword_owned, $.keyword_by, choice($.keyword_none, $.object_reference)),
      )
    ),
  ),

  create_trigger: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($.keyword_constraint),
    // sqlite
    optional($._temporary),
    $.keyword_trigger,
    // sqlite
    optional($._if_not_exists),
    $.object_reference,
    choice(
      $.keyword_before,
      $.keyword_after,
      seq($.keyword_instead, $.keyword_of),
    ),
    $._create_trigger_event,
    repeat(seq($.keyword_or, $._create_trigger_event)),
    $.keyword_on,
    $.object_reference,
    repeat(
      choice(
        seq($.keyword_from, $.object_reference),
        choice(
          seq($.keyword_not, $.keyword_deferrable),
          $.keyword_deferrable,
          seq($.keyword_initially, $.keyword_immediate),
          seq($.keyword_initially, $.keyword_deferred),
        ),
        seq($.keyword_referencing, choice($.keyword_old, $.keyword_new), $.keyword_table, optional($.keyword_as), $.identifier),
        seq(
          $.keyword_for,
          optional($.keyword_each),
          choice($.keyword_row, $.keyword_statement),
        ),
        seq($.keyword_when, wrapped_in_parenthesis($._expression)),
      ),
    ),
    $.keyword_execute,
    choice($.keyword_function, $.keyword_procedure),
    $.object_reference,
    paren_list(field('parameter', $.term)),
  ),

  _create_trigger_event: $ => choice(
    $.keyword_insert,
    seq(
      $.keyword_update,
      optional(
        seq(
          $.keyword_of,
          comma_list($.identifier, true),
        ),
      ),
    ),
    $.keyword_delete,
    $.keyword_truncate,
  ),

  create_type: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_type,
    $.object_reference,
    optional(
      seq(
        choice(
          seq(
            $.keyword_as,
            $.column_definitions,
            optional(seq($.keyword_collate, $.identifier))
          ),
          seq(
            $.keyword_as,
            $.keyword_enum,
            $.enum_elements,
          ),
          seq(
            optional(
              seq(
                $.keyword_as,
                $.keyword_range,
              )
            ),
            paren_list(
              $._with_settings
            ),
          ),
        ),
      ),
    ),
  )),

  enum_elements: $ => seq(
    paren_list(field('enum_element', alias($._literal_string, $.literal))),
  ),

};

const drop_rules = {

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
      $.drop_function,
      $.drop_procedure,
    ),
  ),

  drop_table: $ => seq(
    $.keyword_drop,
    $.keyword_table,
    optional($._if_exists),
    field("target", $.object_reference),
    optional($._drop_behavior),
  ),

  drop_view: $ => seq(
    $.keyword_drop,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  drop_materialized_view: $ => seq(
    $.keyword_drop,
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  drop_schema: $ => seq(
    $.keyword_drop,
    $.keyword_schema,
    optional($._if_exists),
    $.identifier,
    optional($._drop_behavior)
  ),

  drop_database: $ => prec.left(seq(
    $.keyword_drop,
    $.keyword_database,
    optional($._if_exists),
    $.identifier,
    optional($.keyword_with),
    optional($.keyword_force),
  )),

  drop_role: $ => seq(
    $.keyword_drop,
    choice(
      $.keyword_group,
      $.keyword_role,
      $.keyword_user,
    ),
    optional($._if_exists),
    $.identifier,
  ),

  drop_type: $ => seq(
    $.keyword_drop,
    $.keyword_type,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  drop_sequence: $ => seq(
    $.keyword_drop,
    $.keyword_sequence,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  drop_index: $ => seq(
    $.keyword_drop,
    $.keyword_index,
    optional($.keyword_concurrently),
    optional($._if_exists),
    field('name', $.identifier),
    optional($._drop_behavior),
    optional(
      seq(
          $.keyword_on,
          $.object_reference,
      ),
    ),
  ),

  drop_function: $ => seq(
    $.keyword_drop,
    $.keyword_function,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  drop_procedure: $ => seq(
    $.keyword_drop,
    $.keyword_procedure,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

};

const rename_rules = {

  _rename_statement: $ => seq(
    $.keyword_rename,
    choice(
      $.keyword_table,
      $.keyword_tables,
    ),
    optional($._if_exists),
    $.object_reference,
    optional(
      choice(
        $.keyword_nowait,
        seq(
          $.keyword_wait,
          field('timeout', alias($._natural_number, $.literal))
        )
      )
    ),
    $.keyword_to,
    $.object_reference,
    repeat(
      seq(
        ',',
        $._rename_table_names,
      )
    ),
  ),

  _rename_table_names: $ => seq(
    $.object_reference,
    $.keyword_to,
    $.object_reference,
  ),

};

const refresh_rules = {
  refresh_materialized_view: ($) =>
    prec.right(
      seq(
        $.keyword_refresh,
        $.keyword_materialized,
        $.keyword_view,
        optional($.keyword_concurrently),
        $.object_reference,
        optional(
          choice(
            seq($.keyword_with, $.keyword_data),
            seq($.keyword_with, $.keyword_no, $.keyword_data),
          ),
        ),
      ),
    ),
};

const truncate_rules = {

  _truncate_statement: $ => seq(
    $.keyword_truncate,
    optional($.keyword_table),
    optional($.keyword_only),
    comma_list($.object_reference),
    optional($._drop_behavior),
  ),

};

const insert_rules = {

  _insert_statement: $ => seq(
    $.insert,
  ),

  insert: $ => seq(
    $.keyword_insert,
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
    ),
  ),

  _on_conflict: $ => seq(
    $.keyword_on,
    $.keyword_conflict,
    optional($.conflict_target),
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

  // ON CONFLICT (col [, …]) [WHERE predicate] | ON CONSTRAINT name
  conflict_target: $ => choice(
    seq('(', comma_list($._expression), ')', optional($.where)),
    seq($.keyword_on, $.keyword_constraint, field('name', $.identifier)),
  ),

  _on_duplicate_key_update: $ => seq(
    $.keyword_on,
    $.keyword_duplicate,
    $.keyword_key,
    $.keyword_update,
    $.assignment_list,
  ),

  assignment_list: $ => seq(
    $.assignment,
    repeat(seq(',', $.assignment)),
  ),

  assignment: $ => seq(
    field('left',
      alias(
        $._qualified_field,
        $.field,
      ),
    ),
    '=',
    field('right', $._expression),
  ),

  _insert_values: $ => seq(
    optional(alias($._column_list, $.list)),
    choice(
      seq(
        $.keyword_values,
        comma_list($.list, true),
      ),
      $._dml_read,
    ),
  ),

  _set_values: $ => seq(
    $.keyword_set,
    comma_list($.assignment, true),
  ),

}

const update_rules = {

  _update_statement: $ => seq(
    $.update,
  ),

  update: $ => seq(
    $.keyword_update,
    optional($.keyword_only),
    choice(
      $._mysql_update_statement,
      $._postgres_update_statement,
    ),
  ),

  _mysql_update_statement: $ => prec(0,
    seq(
      comma_list(field("target", $.relation), true),
      repeat($.join),
      $._set_values,
      optional($.where),
    ),
  ),

  _postgres_update_statement: $ => prec(1,
    seq(
      field("target", $.relation),
      $._set_values,
      optional($.from),
    ),
  ),

};

const delete_rules = {

  _delete_statement: $ => seq(
    $.delete,
    alias($._delete_from, $.from),
  ),

  _delete_from: $ => seq(
    $.keyword_from,
    optional(
      $.keyword_only,
    ),
    field("target", $.object_reference),
    optional($.where),
    optional($.order_by),
    // Strict ANSI base: no LIMIT on DELETE (dialects re-add it in their override)
  ),

  delete: $ => seq(
    $.keyword_delete,
  ),

};

const merge_rules = {

  _merge_statement: $=> seq(
    $.keyword_merge,
    optional($.keyword_into),
    optional($.keyword_table),
    field("target", $.object_reference),
    optional($._alias),
    $.keyword_using,
    field("source", choice($.subquery, $.object_reference)),
    optional($._alias),
    optional(seq(
      $.keyword_on,
      optional_parenthesis(field('predicate', $._expression)),
    )),
    repeat1($.when_clause)
  ),

  when_clause: $ => prec.left(seq(
    $.keyword_when,
    optional($.keyword_not),
    $.keyword_matched,
    optional(
      seq(
        $.keyword_and,
        optional_parenthesis(field('predicate', $._expression))
      )
    ),
    $.keyword_then,
    choice(
      $.keyword_delete,
      seq(
        $.keyword_update,
        $._set_values,
      ),
      seq(
        $.keyword_insert,
        $._insert_values
      ),
      optional($.where)
    )
  )),

};

const misc_rules = {
  // ---- vendor statements the ISO base no longer defines: COMMENT ON, SHOW TABLES, RESET, USE, index hints, RETURNING
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
    // TODO: access method
    // TODO: aggregate
    $.cast,
    // TODO: collation
    seq($.keyword_column, alias($._qualified_field, $.object_reference)),
    // TODO: constraint (on domain)
    // TODO: conversion
    seq($.keyword_database, $.identifier),
    // TODO: domain
    seq($.keyword_extension, $.object_reference),
    // TODO: event trigger
    // TODO: foreign data wrapper
    // TODO: foreign table
    seq($.keyword_function, $.object_reference, optional($.function_arguments)),
    seq($.keyword_index, $.object_reference),
    // TODO: large object
    seq($.keyword_materialized, $.keyword_view, $.object_reference),
    // TODO: operator (|class|family)
    // TODO: policy
    // TODO: (procedural) language
    seq($.keyword_procedure, $.object_reference, optional($.function_arguments)),
    // TODO: publication
    seq($.keyword_role, $.identifier),
    // TODO: routine
    // TODO: rule
    seq($.keyword_schema, $.identifier),
    seq($.keyword_sequence, $.object_reference),
    // TODO: server
    // TODO: statistics
    // TODO: subscription
    seq($.keyword_table, $.object_reference),
    seq($.keyword_tablespace, $.identifier),
    // TODO: text search (configuration|dictionary|parser|template)
    // TODO: transform for
    seq($.keyword_trigger, $.identifier, $.keyword_on, $.object_reference),
    seq($.keyword_type, $.identifier),
    seq($.keyword_view, $.object_reference),
  ),

  // SHOW TABLES [FROM table] [LIKE pattern]
  _show_tables: $ => seq(
    $.keyword_tables,
    optional(seq($.keyword_from, $._qualified_field)),
    optional(seq($.keyword_like, $._expression))
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
    optional(choice($.keyword_database, $.keyword_schema, $.keyword_catalog)),
    $.object_reference,
  ),

  index_hint: $ => seq(
    choice(
      $.keyword_force,
      $.keyword_use,
      $.keyword_ignore,
    ),
    $.keyword_index,
    optional(
      seq(
        $.keyword_for,
        $.keyword_join,
      ),
    ),
    wrapped_in_parenthesis(
      field('index_name', $.identifier),
    ),
  ),

  returning: $ => seq(
    $.keyword_returning,
    $.select_expression,
  ),
};

export default {

  // PostgreSQL: ORDER BY <expr> USING <operator> (not ISO); NULLS may follow either form.
  order_target: $ => seq(
    $._expression,
    optional(choice(
      $.direction,
      seq($.keyword_using, choice('<', '>', '<=', '>=')),
    )),
    optional(seq($.keyword_nulls, choice($.keyword_first, $.keyword_last))),
  ),

  ...misc_rules,

  // keywords only the vendor rules in this file use; defined here, not in the ISO base
  keyword_analyze: _ => make_keyword("analyze"),
  keyword_explain: _ => make_keyword("explain"),
  keyword_verbose: _ => make_keyword("verbose"),
  keyword_tables: _ => make_keyword("tables"),
  keyword_tablespace: _ => make_keyword("tablespace"),
  keyword_duplicate: _ => make_keyword("duplicate"),
  keyword_force: _ => make_keyword("force"),
  keyword_ignore: _ => make_keyword("ignore"),
  keyword_use: _ => make_keyword("use"),
  keyword_include: _ => make_keyword("include"),
  keyword_character: _ => make_keyword("character"),
  keyword_reset: _ => make_keyword("reset"),
  keyword_returning: _ => make_keyword("returning"),
  keyword_hash: _ => make_keyword("hash"),
  keyword_conflict: _ => make_keyword("conflict"),
  keyword_do: _ => make_keyword("do"),
  keyword_nothing: _ => make_keyword("nothing"),
  keyword_catalog: _ => make_keyword("catalog"),
  keyword_extension: _ => make_keyword("extension"),
  keyword_cache: _ => make_keyword("cache"),
  keyword_collate: _ => make_keyword("collate"),
  keyword_concurrently: _ => make_keyword("concurrently"),
  keyword_connection: _ => make_keyword("connection"),
  keyword_deferrable: _ => make_keyword("deferrable"),
  keyword_encrypted: _ => make_keyword("encrypted"),
  keyword_initially: _ => make_keyword("initially"),
  keyword_none: _ => make_keyword("none"),
  keyword_nowait: _ => make_keyword("nowait"),
  keyword_owned: _ => make_keyword("owned"),
  keyword_password: _ => make_keyword("password"),
  keyword_refresh: _ => make_keyword("refresh"),
  keyword_rename: _ => make_keyword("rename"),
  keyword_unlogged: _ => make_keyword("unlogged"),
  keyword_until: _ => make_keyword("until"),
  keyword_valid: _ => make_keyword("valid"),
  keyword_wait: _ => make_keyword("wait"),

  ...create_rules,
  ...drop_rules,
  ...rename_rules,
  ...refresh_rules,
  ...truncate_rules,
  ...insert_rules,
  ...update_rules,
  ...delete_rules,
  ...merge_rules,

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
  ),

  _dml_write: $ => seq(
    optional($._cte),
    choice(
      $._delete_statement,
      $._insert_statement,
      $._update_statement,
      $._truncate_statement,
    ),
  ),

  _refresh_statement: $ => $.refresh_materialized_view,
};
