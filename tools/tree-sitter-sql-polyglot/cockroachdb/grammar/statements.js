import { comma_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // AS OF SYSTEM TIME <expr>; historical (follower) reads; also used by BACKUP
  as_of_clause: $ => seq(
    $.keyword_as,
    $.keyword_of,
    $.keyword_system,
    $.keyword_time,
    $._expression,
  ),

  // WITH option [= value] [, ...]; shared by BACKUP/RESTORE/IMPORT/CHANGEFEED
  crdb_options_clause: $ => seq(
    $.keyword_with,
    comma_list($.crdb_option, true),
  ),

  crdb_option: $ => seq(
    $.identifier,
    optional(seq('=', $._expression)),
  ),

  // BACKUP [TABLE t [, ...] | DATABASE d [, ...]] INTO 'uri'
  //   [AS OF SYSTEM TIME expr] [WITH option [, ...]]
  backup_statement: $ => seq(
    $.keyword_backup,
    optional(choice(
      seq($.keyword_table, comma_list($.object_reference, true)),
      seq($.keyword_database, comma_list($.object_reference, true)),
    )),
    $.keyword_into,
    field('uri', alias($._literal_string, $.literal)),
    optional($.as_of_clause),
    optional($.crdb_options_clause),
  ),

  // RESTORE [TABLE t [, ...] | DATABASE d [, ...]]
  //   FROM [LATEST IN] 'uri' [WITH option [, ...]]
  restore_statement: $ => seq(
    $.keyword_restore,
    optional(choice(
      seq($.keyword_table, comma_list($.object_reference, true)),
      seq($.keyword_database, comma_list($.object_reference, true)),
    )),
    $.keyword_from,
    choice(
      seq(
        $.keyword_latest,
        $.keyword_in,
        field('uri', alias($._literal_string, $.literal)),
      ),
      field('uri', alias($._literal_string, $.literal)),
    ),
    optional($.crdb_options_clause),
  ),

  // IMPORT INTO t [(col [, ...])] CSV DATA ('uri' [, ...]) [WITH option [, ...]]
  import_into_statement: $ => seq(
    $.keyword_import,
    $.keyword_into,
    $.object_reference,
    optional(alias($._column_list, $.list)),
    $.keyword_csv,
    $.keyword_data,
    wrapped_in_parenthesis(
      comma_list(alias($._literal_string, $.literal), true),
    ),
    optional($.crdb_options_clause),
  ),

  // CREATE CHANGEFEED FOR TABLE t [, ...] [INTO 'sink-uri'] [WITH option [, ...]]
  create_changefeed_statement: $ => seq(
    $.keyword_create,
    $.keyword_changefeed,
    $.keyword_for,
    $.keyword_table,
    comma_list($.object_reference, true),
    optional(seq(
      $.keyword_into,
      field('sink', alias($._literal_string, $.literal)),
    )),
    optional($.crdb_options_clause),
  ),

  // postgres _show_statement plus CockroachDB variants
  // (DATABASES/USERS/JOBS/GRANTS/COLUMNS FROM)
  _show_statement: $ => seq(
    $.keyword_show,
    choice(
      seq($.keyword_create, choice($.keyword_table, $.keyword_view, $.keyword_schema, $.keyword_user), $.object_reference),
      $.keyword_all,
      seq($.keyword_tables, optional(seq($.keyword_from, $.object_reference)), optional(seq($.keyword_like, alias($._literal_string, $.literal)))),
      $.keyword_databases,
      $.keyword_users,
      $.keyword_jobs,
      seq(
        $.keyword_grants,
        optional(seq(
          $.keyword_on,
          choice(
            seq($.keyword_database, $.identifier),
            $.object_reference,
          ),
        )),
      ),
      seq($.keyword_columns, $.keyword_from, $.object_reference),
      $.object_reference,
    ),
  ),

  // UPSERT INTO t [(col [, ...])] VALUES (...) | SELECT ...; insert-or-update
  upsert_statement: $ => seq(
    $.keyword_upsert,
    $.keyword_into,
    $.object_reference,
    choice(
      $._insert_values,
      $._set_values,
    ),
  ),

};
