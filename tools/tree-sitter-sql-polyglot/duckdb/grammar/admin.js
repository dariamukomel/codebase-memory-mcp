import { comma_list, paren_list } from '../../grammar/helpers.js';

// DuckDB statements that had no rule at all, transcribed from their pages
// under https://duckdb.org/docs/current/sql/statements/overview.html
export default {

  // CHECKPOINT [db]  |  FORCE CHECKPOINT [db]
  checkpoint_statement: $ => prec.right(seq(
    optional($.keyword_force),
    $.keyword_checkpoint,
    optional(field('database', $.identifier)),
  )),

  // VACUUM [ANALYZE] [table [(col, …)]]
  vacuum_statement: $ => prec.right(seq(
    $.keyword_vacuum,
    optional($.keyword_analyze),
    optional(seq(
      field('table', $.object_reference),
      optional(paren_list($.identifier, true)),
    )),
  )),

  // ANALYZE
  analyze_statement: $ => $.keyword_analyze,

  // CALL func(arg, …)
  call_statement: $ => seq(
    $.keyword_call,
    field('function', $.object_reference),
    paren_list($._expression),
  ),

  // { DESCRIBE | DESC } { table | query }
  describe_statement: $ => seq(
    choice($.keyword_describe, $.keyword_desc),
    choice($._dml_read, field('table', $.object_reference)),
  ),

  // SET [GLOBAL | SESSION | LOCAL] name { = | TO } value
  // The base set_statement only covers the ANSI transaction forms, so
  // DuckDB's configuration syntax did not parse at all.
  set_config_statement: $ => seq(
    $.keyword_set,
    optional($._config_scope),
    field('name', $.identifier),
    choice('=', $.keyword_to),
    field('value', $._expression),
  ),

  // RESET [GLOBAL | SESSION | LOCAL] name
  reset_config_statement: $ => seq(
    $.keyword_reset,
    optional($._config_scope),
    field('name', $.identifier),
  ),

  _config_scope: $ => choice($.keyword_global, $.keyword_session, $.keyword_local),

  // SET VARIABLE name = expr  |  RESET VARIABLE name
  set_variable_statement: $ => seq(
    choice($.keyword_set, $.keyword_reset),
    $.keyword_variable,
    field('name', $.identifier),
    optional(seq(choice('=', $.keyword_to), field('value', $._expression))),
  ),

  // CREATE [OR REPLACE] [PERSISTENT | TEMPORARY] SECRET [IF NOT EXISTS]
  //   [name] (TYPE t, KEY value, …)
  create_secret_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._secret_storage),
    $.keyword_secret,
    optional($._if_not_exists),
    optional(field('name', $.identifier)),
    paren_list($.secret_option, true),
  ),

  // TYPE s3 | KEY_ID 'x' | SCOPE 's3://…'; a bare `NAME value` pair, with
  // TYPE spelled out because it lexes as a keyword rather than an identifier.
  secret_option: $ => choice(
    seq($.keyword_type, field('value', choice($.identifier, $.literal))),
    seq(field('name', $.identifier), field('value', choice($.identifier, $.literal))),
  ),

  // DROP [PERSISTENT | TEMPORARY] SECRET [IF EXISTS] name
  drop_secret_statement: $ => seq(
    $.keyword_drop,
    optional($._secret_storage),
    $.keyword_secret,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  _secret_storage: $ => choice($.keyword_persistent, $.keyword_temporary),

};
