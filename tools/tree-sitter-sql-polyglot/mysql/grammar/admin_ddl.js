import { comma_list, paren_list } from '../../grammar/helpers.js';

// MySQL statements that had no rule at all. Every shape below is transcribed
// from the syntax block of its own page in the 8.4 reference manual under
// https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html
export default {

  // A `NAME [=] value` option, the shape shared by the open-ended option
  // tails of the tablespace / logfile-group / resource-group statements. The
  // value is mandatory on purpose: with an optional value, a repeat of this
  // rule cannot tell an option's value from the next option's name.
  mysql_option: $ => seq(
    field('name', $.identifier),
    optional('='),
    field('value', choice($.literal, $.identifier)),
  ),

  // ── Events ──────────────────────────────────────────────────────────────

  // ALTER [DEFINER = user] EVENT name [ON SCHEDULE …] [RENAME TO …]
  //   [ENABLE | DISABLE] [COMMENT '…'] [DO body]
  alter_event: $ => prec.right(seq(
    $.keyword_alter,
    optional(seq($.keyword_definer, '=', $.identifier)),
    $.keyword_event,
    field('name', $.object_reference),
    optional(seq($.keyword_on, $.keyword_schedule, $._event_schedule)),
    optional(seq(
      $.keyword_on,
      $.keyword_completion,
      optional($.keyword_not),
      $.keyword_preserve,
    )),
    optional(seq($.keyword_rename, $.keyword_to, field('new_name', $.object_reference))),
    optional(choice($.keyword_enable, $.keyword_disable)),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
    optional(seq($.keyword_do, choice($._dml_read, $._dml_write))),
  )),

  // DROP EVENT [IF EXISTS] name
  drop_event: $ => seq(
    $.keyword_drop,
    $.keyword_event,
    optional($._if_exists),
    field('name', $.object_reference),
  ),

  // ── Servers, tablespaces, logfile groups ────────────────────────────────

  // CREATE SERVER name FOREIGN DATA WRAPPER w OPTIONS (opt, …)
  create_server: $ => seq(
    $.keyword_create,
    $.keyword_server,
    field('name', $.identifier),
    $.keyword_foreign,
    $.keyword_data,
    // WRAPPER is matched as an identifier, not promoted to a keyword: the
    // corpus already uses `wrapper` as a procedure name, and nothing here
    // needs to tell it apart from an identifier.
    $.identifier,
    field('wrapper', $.identifier),
    $.keyword_options,
    paren_list($.mysql_option, true),
  ),

  // ALTER SERVER name OPTIONS (opt, …)
  alter_server: $ => seq(
    $.keyword_alter,
    $.keyword_server,
    field('name', $.identifier),
    $.keyword_options,
    paren_list($.mysql_option, true),
  ),

  // DROP SERVER [IF EXISTS] name
  drop_server: $ => seq(
    $.keyword_drop,
    $.keyword_server,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  // CREATE [UNDO] TABLESPACE name [ADD DATAFILE '…'] [USE LOGFILE GROUP g]
  //   [option …]
  create_tablespace: $ => prec.right(seq(
    $.keyword_create,
    optional($.keyword_undo),
    $.keyword_tablespace,
    field('name', $.identifier),
    optional(seq($.keyword_add, $.keyword_datafile, alias($._literal_string, $.literal))),
    optional(seq(
      $.keyword_use,
      $.keyword_logfile,
      $.keyword_group,
      field('logfile_group', $.identifier),
    )),
    repeat($._tablespace_option),
  )),

  // ALTER [UNDO] TABLESPACE name { ADD|DROP DATAFILE … | RENAME TO … |
  //   SET ACTIVE|INACTIVE | option … }
  alter_tablespace: $ => prec.right(seq(
    $.keyword_alter,
    optional($.keyword_undo),
    $.keyword_tablespace,
    field('name', $.identifier),
    optional(seq(
      choice($.keyword_add, $.keyword_drop),
      $.keyword_datafile,
      alias($._literal_string, $.literal),
    )),
    optional(seq($.keyword_rename, $.keyword_to, field('new_name', $.identifier))),
    optional(seq($.keyword_set, field('state', $.identifier))),
    repeat($._tablespace_option),
  )),

  // DROP [UNDO] TABLESPACE name
  drop_tablespace: $ => seq(
    $.keyword_drop,
    optional($.keyword_undo),
    $.keyword_tablespace,
    field('name', $.identifier),
  ),

  _tablespace_option: $ => choice(
    $.keyword_wait,
    seq($.keyword_engine, optional('='), field('engine', $.identifier)),
    seq($.keyword_comment, optional('='), alias($._literal_string, $.literal)),
    $.mysql_option,
  ),

  // CREATE LOGFILE GROUP g ADD UNDOFILE '…' [option …] ENGINE [=] e
  create_logfile_group: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_logfile,
    $.keyword_group,
    field('name', $.identifier),
    $.keyword_add,
    $.keyword_undofile,
    alias($._literal_string, $.literal),
    repeat($._tablespace_option),
  )),

  // ALTER LOGFILE GROUP g ADD UNDOFILE '…' [option …] ENGINE [=] e
  alter_logfile_group: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_logfile,
    $.keyword_group,
    field('name', $.identifier),
    $.keyword_add,
    $.keyword_undofile,
    alias($._literal_string, $.literal),
    repeat($._tablespace_option),
  )),

  // DROP LOGFILE GROUP g ENGINE [=] e
  drop_logfile_group: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_logfile,
    $.keyword_group,
    field('name', $.identifier),
    repeat($._tablespace_option),
  )),

  // ── Spatial reference systems ───────────────────────────────────────────

  // CREATE [OR REPLACE] SPATIAL REFERENCE SYSTEM [IF NOT EXISTS] srid attr …
  create_spatial_reference_system: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_spatial,
    $.keyword_reference,
    $.keyword_system,
    optional($._if_not_exists),
    field('srid', alias($._natural_number, $.literal)),
    repeat($.srs_attribute),
  )),

  // NAME '…' | DEFINITION '…' | DESCRIPTION '…'
  //   | ORGANIZATION '…' IDENTIFIED BY id
  // The four attribute names are matched as identifiers rather than promoted
  // to keywords: NAME would shadow the base grammar's NAMES, and none of them
  // needs to be distinguished from an identifier here.
  srs_attribute: $ => prec.right(seq(
    field('attribute', $.identifier),
    alias($._literal_string, $.literal),
    optional(seq(
      $.keyword_identified,
      $.keyword_by,
      field('org_id', alias($._natural_number, $.literal)),
    )),
  )),

  // DROP SPATIAL REFERENCE SYSTEM [IF EXISTS] srid
  drop_spatial_reference_system: $ => seq(
    $.keyword_drop,
    $.keyword_spatial,
    $.keyword_reference,
    $.keyword_system,
    optional($._if_exists),
    field('srid', alias($._natural_number, $.literal)),
  ),

  // ── Resource groups ─────────────────────────────────────────────────────

  // CREATE RESOURCE GROUP g TYPE = {SYSTEM|USER} [option …] [ENABLE|DISABLE]
  // ALTER  RESOURCE GROUP g [option …] [ENABLE|DISABLE [FORCE]]
  create_resource_group: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter),
    $.keyword_resource,
    $.keyword_group,
    field('name', $.identifier),
    optional(seq(
      $.keyword_type,
      optional('='),
      field('type', choice($.keyword_system, $.keyword_user)),
    )),
    repeat($.mysql_option),
    optional(seq(
      choice($.keyword_enable, $.keyword_disable),
      optional($.keyword_force),
    )),
  )),

  // DROP RESOURCE GROUP g [FORCE]
  drop_resource_group: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_resource,
    $.keyword_group,
    field('name', $.identifier),
    optional($.keyword_force),
  )),

  // SET RESOURCE GROUP g [FOR thread_id [, …]]
  set_resource_group: $ => prec.right(seq(
    $.keyword_set,
    $.keyword_resource,
    $.keyword_group,
    field('name', $.identifier),
    optional(seq(
      $.keyword_for,
      comma_list(alias($._natural_number, $.literal), true),
    )),
  )),

  // ── Query-shaped statements ─────────────────────────────────────────────

  // DO expr [, expr] …
  do_statement: $ => seq(
    $.keyword_do,
    comma_list($._expression, true),
  ),

  // TABLE and VALUES already exist in this dialect: mysql's _dml_read
  // carries table_statement and values_row_statement, so they are query
  // expressions here, not separate statements.

  // HANDLER t OPEN [[AS] alias]
  // HANDLER t READ … [WHERE …] [LIMIT …]
  // HANDLER t CLOSE
  handler_statement: $ => prec.right(seq(
    $.keyword_handler,
    field('table', $.object_reference),
    choice(
      seq($.keyword_open, optional(seq(optional($.keyword_as), field('alias', $.identifier)))),
      $.keyword_close,
      seq(
        $.keyword_read,
        choice(
          seq(
            field('index', $.identifier),
            choice('=', '<=', '>=', '<', '>'),
            paren_list($._expression, true),
          ),
          seq(
            field('index', $.identifier),
            choice($.keyword_first, $.keyword_next, $.keyword_prev, $.keyword_last),
          ),
          choice($.keyword_first, $.keyword_next),
        ),
        optional($.where),
        optional($.limit),
      ),
    ),
  )),

  // IMPORT TABLE FROM 'sdi_file' [, …]
  import_table_statement: $ => seq(
    $.keyword_import,
    $.keyword_table,
    $.keyword_from,
    comma_list(alias($._literal_string, $.literal), true),
  ),

  // LOAD XML [LOW_PRIORITY | CONCURRENT] [LOCAL] INFILE '…'
  //   [REPLACE | IGNORE] INTO TABLE t [CHARACTER SET cs]
  //   [ROWS IDENTIFIED BY '<tag>'] [IGNORE n {LINES | ROWS}] [(fields)]
  //   [SET assignments]
  load_xml_statement: $ => prec.right(seq(
    $.keyword_load,
    $.keyword_xml,
    optional(choice($.keyword_low_priority, $.keyword_concurrent)),
    optional($.keyword_local),
    $.keyword_infile,
    alias($._literal_string, $.literal),
    optional(choice($.keyword_replace, $.keyword_ignore)),
    $.keyword_into,
    $.keyword_table,
    field('table', $.object_reference),
    optional(seq($.keyword_character, $.keyword_set, field('charset', $.identifier))),
    optional(seq(
      $.keyword_rows,
      $.keyword_identified,
      $.keyword_by,
      alias($._literal_string, $.literal),
    )),
    optional(seq(
      $.keyword_ignore,
      alias($._natural_number, $.literal),
      choice($.keyword_lines, $.keyword_rows),
    )),
    optional(paren_list($.identifier, true)),
    optional(seq($.keyword_set, $.assignment_list)),
  )),

  // ── Locking, cloning, admin ─────────────────────────────────────────────

  // LOCK {TABLE | TABLES} t [[AS] alias] {READ [LOCAL] | WRITE} [, …]
  lock_tables_statement: $ => seq(
    $.keyword_lock,
    choice($.keyword_table, $.keyword_tables),
    comma_list($.lock_table_spec, true),
  ),

  lock_table_spec: $ => prec.right(seq(
    field('table', $.object_reference),
    optional(seq(optional($.keyword_as), field('alias', $.identifier))),
    choice(
      seq($.keyword_read, optional($.keyword_local)),
      $.keyword_write,
    ),
  )),

  // UNLOCK {TABLE | TABLES}
  unlock_tables_statement: $ => seq(
    $.keyword_unlock,
    choice($.keyword_table, $.keyword_tables),
  ),

  // LOCK INSTANCE FOR BACKUP  |  UNLOCK INSTANCE
  lock_instance_statement: $ => choice(
    seq($.keyword_lock, $.keyword_instance, $.keyword_for, $.keyword_backup),
    seq($.keyword_unlock, $.keyword_instance),
  ),

  // ALTER INSTANCE instance_action
  alter_instance: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_instance,
    repeat1(choice($.identifier, $.keyword_enable, $.keyword_disable, $.keyword_key)),
  )),

  // CLONE LOCAL DATA DIRECTORY [=] '…'
  // CLONE INSTANCE FROM 'user'@'host':port IDENTIFIED BY '…' [option …]
  clone_statement: $ => prec.right(seq(
    $.keyword_clone,
    choice(
      seq(
        $.keyword_local,
        $.keyword_data,
        $.keyword_directory,
        optional('='),
        alias($._literal_string, $.literal),
      ),
      seq(
        $.keyword_instance,
        $.keyword_from,
        field('source', $.account_name),
        ':',
        field('port', alias($._natural_number, $.literal)),
        $.keyword_identified,
        $.keyword_by,
        alias($._literal_string, $.literal),
        optional(seq(
          $.keyword_data,
          $.keyword_directory,
          optional('='),
          alias($._literal_string, $.literal),
        )),
        optional(seq($.keyword_require, optional($.keyword_no), $.keyword_ssl)),
      ),
    ),
  )),

  // HELP 'search_string'
  help_statement: $ => seq(
    $.keyword_help,
    alias($._literal_string, $.literal),
  ),

  // INSTALL PLUGIN p SONAME '…'  |  INSTALL COMPONENT '…' [, …]
  install_statement: $ => seq(
    $.keyword_install,
    choice(
      seq(
        $.keyword_plugin,
        field('name', $.identifier),
        $.keyword_soname,
        alias($._literal_string, $.literal),
      ),
      seq(
        $.keyword_component,
        comma_list(alias($._literal_string, $.literal), true),
      ),
    ),
  ),

  // UNINSTALL PLUGIN p  |  UNINSTALL COMPONENT '…' [, …]
  uninstall_statement: $ => seq(
    $.keyword_uninstall,
    choice(
      seq($.keyword_plugin, field('name', $.identifier)),
      seq($.keyword_component, comma_list(alias($._literal_string, $.literal), true)),
    ),
  ),

  // CHECKSUM TABLE t [, …] [QUICK | EXTENDED]
  checksum_table_statement: $ => prec.right(seq(
    $.keyword_checksum,
    $.keyword_table,
    comma_list($.object_reference, true),
    optional(choice($.keyword_quick, $.keyword_extended)),
  )),

  // FLUSH [NO_WRITE_TO_BINLOG | LOCAL] flush_option [, …]
  flush_statement: $ => prec.right(seq(
    $.keyword_flush,
    optional(choice($.keyword_no_write_to_binlog, $.keyword_local)),
    choice(
      comma_list($.flush_option, true),
      seq(
        choice($.keyword_table, $.keyword_tables),
        optional(comma_list($.object_reference, true)),
        optional(choice(
          seq($.keyword_with, $.keyword_read, $.keyword_lock),
          seq($.keyword_for, $.keyword_export),
        )),
      ),
    ),
  )),

  // BINARY LOGS | ENGINE LOGS | RELAY LOGS | LOGS | PRIVILEGES | STATUS | …
  // The log kinds are identifiers rather than keywords: `logs` is a table
  // name in the existing corpus, so promoting it would break those tests.
  flush_option: $ => prec.right(seq(
    choice(
      $.keyword_privileges,
      $.keyword_status,
      $.keyword_binary,
      $.keyword_engine,
      field('option', $.identifier),
    ),
    optional(field('kind', $.identifier)),
  )),

  // KILL [CONNECTION | QUERY] processlist_id
  kill_statement: $ => seq(
    $.keyword_kill,
    optional(choice($.keyword_connection, $.keyword_query)),
    field('process_id', alias($._natural_number, $.literal)),
  ),

  // RESET reset_option [, …]
  // A deliberate override of the base (PostgreSQL-shaped) `RESET name`:
  // MySQL's RESET is a replication/binlog statement, not a settings reset.
  reset_statement: $ => seq(
    $.keyword_reset,
    comma_list($.reset_option, true),
  ),

  // BINARY LOGS AND GTIDS | REPLICA
  reset_option: $ => prec.right(seq(
    choice($.keyword_binary, field('option', $.identifier)),
    optional(field('kind', $.identifier)),
    optional(seq($.keyword_and, field('extra', $.identifier))),
  )),

  // RESTART  |  SHUTDOWN
  restart_statement: $ => choice($.keyword_restart, $.keyword_shutdown),

};
