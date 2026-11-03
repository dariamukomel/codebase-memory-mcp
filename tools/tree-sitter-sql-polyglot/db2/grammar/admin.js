import { comma_list, paren_list } from '../../grammar/helpers.js';

// Db2 statements that had no rule at all. Every shape is transcribed from the
// Syntax section of its entry in the Db2 12.1.3 SQL Reference
// (public.dhe.ibm.com/ps/products/db2/info/vr121/pdf/en_US/db2_sql_reference_1213.pdf).
export default {

  // LOCK TABLE t IN { SHARE | EXCLUSIVE } MODE
  lock_table_statement: $ => seq(
    $.keyword_lock,
    $.keyword_table,
    field('table', $.object_reference),
    $.keyword_in,
    field('mode', choice($.keyword_share, $.keyword_exclusive)),
    $.keyword_mode,
  ),

  // CALL procedure ( [arg [, …]] )
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    optional(paren_list(choice($.named_argument, $._expression))),
  ),

  // REFRESH TABLE t [, …] [INCREMENTAL | NOT INCREMENTAL]
  //   [ALLOW {NO | READ | WRITE} ACCESS]
  refresh_table_statement: $ => prec.right(seq(
    $.keyword_refresh,
    $.keyword_table,
    comma_list($.object_reference, true),
    repeat(choice(
      seq(optional($.keyword_not), $.keyword_incremental),
      seq(
        $.keyword_allow,
        choice($.keyword_no, $.keyword_read, $.keyword_write),
        $.keyword_access,
      ),
      // query-optimization-options
      seq($.keyword_allow, $.keyword_query, $.keyword_optimization),
      seq($.keyword_using, $.keyword_refresh, $.keyword_deferred, $.keyword_tables),
      seq($.keyword_with, $.keyword_refresh, $.keyword_age, $.keyword_any),
    )),
  )),

  // TRUNCATE [TABLE] t [DROP|REUSE STORAGE]
  //   [IGNORE|RESTRICT WHEN DELETE TRIGGERS] [CONTINUE IDENTITY] [IMMEDIATE]
  // Overrides the base rule, whose ANSI tail is CASCADE/RESTRICT rather than
  // Db2's storage and trigger options.
  _truncate_statement: $ => prec.right(seq(
    $.keyword_truncate,
    optional($.keyword_table),
    field('table', $.object_reference),
    repeat(choice(
      seq(choice($.keyword_drop, $.keyword_reuse), $.keyword_storage),
      seq($.keyword_ignore, $.keyword_delete, $.keyword_triggers),
      seq($.keyword_restrict, $.keyword_when, $.keyword_delete, $.keyword_triggers),
      seq($.keyword_continue, $.keyword_identity),
      $.keyword_immediate,
    )),
  )),

  // SET SCHEMA / PATH / ROLE / SESSION AUTHORIZATION / ENCRYPTION PASSWORD
  // are deliberately absent: this dialect's set_statement already ends in a
  // generic `object_reference = expression` branch, which accepts all of them.
  // Adding dedicated rules would make `SET SCHEMA = x` reducible two ways,
  // because `word: $ => $._identifier` means an unreserved keyword and an
  // identifier are the same token until the parse state picks one.

  // SET INTEGRITY FOR t [, …] <action>
  // The full action grammar is large; the common OFF / IMMEDIATE CHECKED /
  // FULL ACCESS forms are covered and further words are accepted as
  // identifiers rather than modelled exhaustively.
  set_integrity_statement: $ => prec.right(seq(
    $.keyword_set,
    $.keyword_integrity,
    $.keyword_for,
    comma_list($.object_reference, true),
    repeat1(choice(
      $.keyword_off,
      seq($.keyword_full, $.keyword_access),
      seq($.keyword_immediate, optional($.keyword_checked)),
      seq($.keyword_immediate, $.keyword_unchecked),
      seq($.keyword_allow, choice($.keyword_no, $.keyword_read), $.keyword_access),
      seq($.keyword_cascade, choice($.keyword_immediate, $.keyword_deferred)),
      field('option', $.identifier),
    )),
  )),

  // FLUSH { PACKAGE CACHE DYNAMIC | EVENT MONITOR m [BUFFER]
  //       | BUFFERPOOLS ALL | FEDERATED CACHE | AUTHENTICATION CACHE
  //       | OPTIMIZATION PROFILE CACHE [name | ALL] }
  flush_statement: $ => prec.right(seq(
    $.keyword_flush,
    choice(
      seq($.keyword_package, $.keyword_cache, optional($.keyword_dynamic)),
      seq(
        $.keyword_event,
        $.keyword_monitor,
        field('name', $.identifier),
        optional($.keyword_buffer),
      ),
      seq($.keyword_bufferpools, optional($.keyword_all)),
      seq($.keyword_federated, $.keyword_cache),
      seq($.keyword_authentication, $.keyword_cache),
      seq(
        $.keyword_optimization,
        $.keyword_profile,
        $.keyword_cache,
        optional(choice($.keyword_all, field('name', $.object_reference))),
      ),
    ),
  )),

  // FREE LOCATOR v [, …]
  free_locator_statement: $ => seq(
    $.keyword_free,
    $.keyword_locator,
    comma_list($.identifier, true),
  ),

  // DESCRIBE { INPUT | OUTPUT } statement-name INTO descriptor-name
  describe_statement: $ => seq(
    $.keyword_describe,
    choice($.keyword_input, $.keyword_output),
    field('statement_name', $.identifier),
    $.keyword_into,
    field('descriptor', $.identifier),
  ),

  // EXECUTE IMMEDIATE expression
  execute_immediate_statement: $ => seq(
    $.keyword_execute,
    $.keyword_immediate,
    field('statement', $._expression),
  ),

  // CONNECT [TO server [USER u [USING p]]] [RESET]
  connect_statement: $ => prec.right(seq(
    $.keyword_connect,
    optional(seq(
      $.keyword_to,
      field('server', $.identifier),
      optional(seq(
        $.keyword_user,
        field('user', choice($.identifier, $.literal)),
        optional(seq($.keyword_using, field('password', choice($.identifier, $.literal)))),
      )),
    )),
    optional($.keyword_reset),
  )),

  // DISCONNECT { server | CURRENT | ALL [SQL] }
  disconnect_statement: $ => prec.right(seq(
    $.keyword_disconnect,
    choice(
      $.keyword_current,
      seq($.keyword_all, optional($.keyword_sql)),
      field('server', $.identifier),
    ),
  )),

  // CREATE [OR REPLACE] [PUBLIC] ALIAS name FOR
  //   { [TABLE] t | MODULE m | SEQUENCE s }
  create_alias_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($.keyword_public),
    $.keyword_alias,
    field('name', $.object_reference),
    $.keyword_for,
    optional(choice($.keyword_table, $.keyword_module, $.keyword_sequence)),
    field('target', $.object_reference),
  ),

  // CREATE [OR REPLACE] VARIABLE v <type> [DEFAULT expr | CONSTANT expr]
  create_variable_statement: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_variable,
    field('name', $.object_reference),
    field('type', $._type),
    optional(seq(
      choice($.keyword_default, $.keyword_constant),
      field('value', $._expression),
    )),
  )),

  // AUDIT policy-block { USING | REPLACE | REMOVE } POLICY p
  // AUDIT { ADD | REMOVE } EXCEPTION FOR TRUSTED CONTEXT c
  audit_statement: $ => prec.right(seq(
    $.keyword_audit,
    choice(
      seq(
        choice($.keyword_add, $.keyword_remove),
        $.keyword_exception,
        $.keyword_for,
        $.keyword_trusted,
        $.keyword_context,
        field('context', $.identifier),
      ),
      seq(
        comma_list($._audit_target, true),
        choice(
          seq(
            choice($.keyword_using, $.keyword_replace),
            $.keyword_policy,
            field('policy', $.identifier),
          ),
          seq($.keyword_remove, $.keyword_policy),
        ),
      ),
    ),
  )),

  _audit_target: $ => choice(
    $.keyword_database,
    seq($.keyword_table, field('table', $.object_reference)),
    seq($.keyword_trusted, $.keyword_context, field('context', $.identifier)),
    seq(
      choice($.keyword_user, $.keyword_group, $.keyword_role),
      field('name', $.identifier),
    ),
    field('authority', $.identifier),
  ),

  // WHENEVER { NOT FOUND | SQLERROR | SQLWARNING }
  //   { CONTINUE | GOTO label | GO TO label }
  whenever_statement: $ => seq(
    $.keyword_whenever,
    choice(
      seq($.keyword_not, $.keyword_found),
      $.keyword_sqlerror,
      $.keyword_sqlwarning,
    ),
    choice(
      $.keyword_continue,
      seq(
        choice($.keyword_goto, seq($.keyword_go, $.keyword_to)),
        optional(':'),
        field('label', $.identifier),
      ),
    ),
  ),

  // GOTO label
  goto_statement: $ => seq(
    $.keyword_goto,
    field('label', $.identifier),
  ),

  // ALLOCATE cursor-name CURSOR FOR RESULT SET rs-locator-variable
  // The name precedes the CURSOR keyword; this is not the ANSI word order.
  allocate_cursor_statement: $ => seq(
    $.keyword_allocate,
    field('name', $.identifier),
    $.keyword_cursor,
    $.keyword_for,
    $.keyword_result,
    $.keyword_set,
    field('result_set', $.identifier),
  ),

  // ASSOCIATE [RESULT SET] {LOCATOR | LOCATORS} (v [, …])
  //   WITH PROCEDURE p
  associate_locators_statement: $ => seq(
    $.keyword_associate,
    optional(seq($.keyword_result, $.keyword_set)),
    choice($.keyword_locator, $.keyword_locators),
    paren_list($.identifier, true),
    $.keyword_with,
    $.keyword_procedure,
    field('procedure', $.object_reference),
  ),

};
