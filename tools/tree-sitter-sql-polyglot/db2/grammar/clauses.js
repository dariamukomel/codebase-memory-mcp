import { comma_list, paren_list } from '../../grammar/helpers.js';

// Statements that already had a rule but only covered part of the vendor
// syntax. Each override reproduces the inherited body and adds the clauses
// the Db2 12.1.3 SQL Reference syntax diagram shows; an override replaces
// the parent rule wholesale, so nothing may be dropped.
export default {

  // SAVEPOINT name [UNIQUE] [ON ROLLBACK RETAIN {CURSORS | LOCKS}]
  savepoint_statement: $ => prec.right(seq(
    $.keyword_savepoint,
    field('name', $.identifier),
    optional($.keyword_unique),
    repeat(seq(
      $.keyword_on,
      $.keyword_rollback,
      $.keyword_retain,
      choice($.keyword_cursors, $.keyword_locks),
    )),
  )),

  // CLOSE cursor [WITH RELEASE]
  close_cursor_statement: $ => seq(
    $.keyword_close,
    field('name', $.identifier),
    optional(seq($.keyword_with, $.keyword_release)),
  ),

  // DECLARE cursor [ASENSITIVE | INSENSITIVE] CURSOR
  //   [WITH[OUT] HOLD] [WITH[OUT] RETURN [TO {CALLER | CLIENT}]]
  //   FOR {<select> | statement-name}
  declare_cursor_statement: $ => seq(
    $.keyword_declare,
    field('name', $.identifier),
    optional(choice($.keyword_asensitive, $.keyword_insensitive)),
    $.keyword_cursor,
    repeat(choice(
      seq(choice($.keyword_with, $.keyword_without), $.keyword_hold),
      seq(
        choice($.keyword_with, $.keyword_without),
        $.keyword_return,
        optional(seq($.keyword_to, choice($.keyword_caller, $.keyword_client))),
      ),
    )),
    $.keyword_for,
    choice($._dml_read, field('statement_name', $.identifier)),
  ),

  // ALTER INDEX name COMPRESS {YES | NO}
  // The inherited alternatives are kept; COMPRESS is added alongside them.
  alter_index: $ => seq(
    $.keyword_alter,
    $.keyword_index,
    optional($._if_exists),
    $.identifier,
    choice(
      $.rename_object,
      seq($.keyword_reset, paren_list($.identifier)),
      seq(
        $.keyword_set,
        choice(
          seq($.keyword_tablespace, $.identifier),
          paren_list(seq($.identifier, '=', field('value', $.literal))),
        ),
      ),
      seq($.keyword_compress, choice($.keyword_yes, $.keyword_no)),
    ),
  ),

  // ALTER VIEW name
  //   { ALTER [COLUMN] col ADD SCOPE typed-table
  //   | {ENABLE | DISABLE} QUERY OPTIMIZATION | <inherited> }
  alter_view: $ => seq(
    $.keyword_alter,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      $.rename_column,
      $.set_schema,
      $.change_ownership,
      seq($.keyword_as, $._dml_read),
      seq(
        $.keyword_alter,
        optional($.keyword_column),
        field('column', $.identifier),
        $.keyword_add,
        $.keyword_scope,
        field('scope', $.object_reference),
      ),
      seq(
        choice($.keyword_enable, $.keyword_disable),
        $.keyword_query,
        $.keyword_optimization,
      ),
    ),
  ),

  // ALTER SCHEMA name
  //   { DATA CAPTURE {NONE | CHANGES}
  //   | {ENABLE | DISABLE} ROW MODIFICATION TRACKING
  //   | {RENAME | OWNER} TO name }
  alter_schema: $ => seq(
    $.keyword_alter,
    $.keyword_schema,
    $.identifier,
    choice(
      seq(
        choice($.keyword_rename, $.keyword_owner),
        $.keyword_to,
        $.identifier,
      ),
      seq(
        $.keyword_data,
        $.keyword_capture,
        choice($.keyword_none, $.keyword_changes),
      ),
      seq(
        choice($.keyword_enable, $.keyword_disable),
        $.keyword_row,
        $.keyword_modification,
        $.keyword_tracking,
      ),
    ),
  ),

  // ALTER DATABASE [name] {ADD | DROP} STORAGE ON 'path' [,...]
  // The database name is optional in Db2; the inherited alternatives are
  // kept alongside the storage-path form.
  alter_database: $ => seq(
    $.keyword_alter,
    $.keyword_database,
    optional($.identifier),
    optional($.keyword_with),
    choice(
      $.rename_object,
      $.change_ownership,
      seq(
        $.keyword_reset,
        choice($.keyword_all, field('configuration_parameter', $.identifier)),
      ),
      seq(
        $.keyword_set,
        choice(seq($.keyword_tablespace, $.identifier), $.set_configuration),
      ),
      seq(
        choice($.keyword_add, $.keyword_drop),
        $.keyword_storage,
        $.keyword_on,
        comma_list(field('path', $.literal), true),
      ),
    ),
  ),

  // SET SCHEMA [=] { name | USER | SESSION_USER | SYSTEM_USER
  //                | CURRENT_USER | <string> }
  // The SET CURRENT SCHEMA spelling is deliberately absent: set_statement
  // already accepts `<special_register> = <expression>`, and CURRENT SCHEMA
  // is one of those registers, so admitting it here too would be ambiguous.
  // SCHEMA is reserved in this dialect (see grammar.js) so that SET SCHEMA
  // cannot be read as set_variable_statement's identifier target, and
  // set_schema is added to _ddl_statement there so the statement form is
  // reachable at all; base only ever uses this rule as a clause of
  // ALTER TABLE / ALTER VIEW.
  set_schema: $ => seq(
    $.keyword_set,
    $.keyword_schema,
    optional('='),
    field('schema', choice(
      $.identifier,
      $.literal,
      $.keyword_user,
      $.keyword_session_user,
      $.keyword_system_user,
      $.keyword_current_user,
    )),
  ),

  // TRANSFER OWNERSHIP OF <object> TO {USER | GROUP | ROLE} name
  //   {PRESERVE | REVOKE} PRIVILEGES
  transfer_ownership: $ => seq(
    $.keyword_transfer,
    $.keyword_ownership,
    $.keyword_of,
    $._transferable_object,
    $.keyword_to,
    choice($.keyword_user, $.keyword_group, $.keyword_role),
    field('owner', $.identifier),
    seq(
      choice($.keyword_preserve, $.keyword_revoke),
      $.keyword_privileges,
    ),
  ),

  // The object kinds the syntax diagram lists. Two-word kinds come first so
  // the longer form is preferred over its one-word prefix.
  _transferable_object: $ => seq(
    choice(
      seq($.keyword_database, $.keyword_partition, $.keyword_group),
      seq($.keyword_event, $.keyword_monitor),
      seq($.keyword_function, $.keyword_mapping),
      seq($.keyword_index, $.keyword_extension),
      seq($.keyword_table, $.keyword_hierarchy),
      seq($.keyword_type, $.keyword_mapping),
      seq($.keyword_distinct, $.keyword_type),
      $.keyword_alias,
      $.keyword_constraint,
      $.keyword_function,
      $.keyword_index,
      $.keyword_method,
      $.keyword_nickname,
      $.keyword_package,
      $.keyword_procedure,
      $.keyword_schema,
      $.keyword_sequence,
      $.keyword_table,
      $.keyword_tablespace,
      $.keyword_trigger,
      $.keyword_type,
      $.keyword_variable,
      $.keyword_view,
      $.keyword_xsrobject,
    ),
    field('object', $.object_reference),
    optional(seq($.keyword_version, field('version', $.identifier))),
  ),

};
