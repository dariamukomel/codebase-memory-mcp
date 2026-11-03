import { comma_list } from '../../grammar/helpers.js';

export default {

  // KILL QUERY WHERE expr [SYNC|ASYNC|TEST]
  kill_query_statement: $ => seq(
    $.keyword_kill,
    $.keyword_query,
    $.where,
    optional(choice($.keyword_sync, $.keyword_async, $.keyword_test)),
  ),

  // KILL MUTATION WHERE expr [SYNC|ASYNC|TEST]
  kill_mutation_statement: $ => seq(
    $.keyword_kill,
    $.keyword_mutation,
    $.where,
    optional(choice($.keyword_sync, $.keyword_async, $.keyword_test)),
  ),

  // CREATE USER [IF NOT EXISTS] name
  //   [IDENTIFIED WITH method BY 'pass']
  //   [DEFAULT ROLE ALL | role [, role]]
  //   [HOST IP 'addr']
  //   [SETTINGS k = v [, ...]]
  create_user_statement: $ => seq(
    $.keyword_create,
    $.keyword_user,
    optional($._if_not_exists),
    $.identifier,
    optional(seq(
      $.keyword_identified,
      $.keyword_with,
      $.identifier,
      $.keyword_by,
      alias($._literal_string, $.literal),
    )),
    optional(seq(
      $.keyword_default,
      $.keyword_role,
      choice($.keyword_all, comma_list($.identifier, true)),
    )),
    optional(seq(
      $.keyword_host,
      $.keyword_ip,
      alias($._literal_string, $.literal),
    )),
    optional($.ch_settings_clause),
  ),

  // ALTER USER name DEFAULT ROLE ALL | RENAME TO name
  alter_user_statement: $ => seq(
    $.keyword_alter,
    $.keyword_user,
    $.identifier,
    choice(
      seq(
        $.keyword_default,
        $.keyword_role,
        choice($.keyword_all, comma_list($.identifier, true)),
      ),
      seq($.keyword_rename, $.keyword_to, $.identifier),
    ),
  ),

  // CREATE ROLE [IF NOT EXISTS] name
  // CREATE ROLE [IF NOT EXISTS | OR REPLACE] name [,...] [ON CLUSTER c]
  //   [IN storage] [SETTINGS <setting> [,...]]
  create_role_statement: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_role,
    optional(choice($._if_not_exists, $._or_replace)),
    comma_list($.identifier, true),
    optional($.on_cluster),
    optional(seq($.keyword_in, field('storage', $.identifier))),
    optional(seq($.keyword_settings, comma_list($._ch_setting, true))),
  )),

  // variable [= value] [MIN [=] v] [MAX [=] v]
  //   [CONST | READONLY | WRITABLE | CHANGEABLE_IN_READONLY]
  // or PROFILE 'name'
  _ch_setting: $ => choice(
    seq($.keyword_profile, field('profile', $.literal)),
    seq(
      field('name', $.identifier),
      optional(seq('=', field('value', $._expression))),
      optional(seq($.keyword_min, optional('='), field('min', $._expression))),
      optional(seq($.keyword_max, optional('='), field('max', $._expression))),
      optional(field('constraint', choice(
        $.keyword_const,
        $.keyword_readonly,
        $.keyword_writable,
        $.keyword_changeable_in_readonly,
      ))),
    ),
  ),

  // GRANT role [, role] TO user [, user]  (ClickHouse role-grant, no ON clause)
  ch_grant_statement: $ => seq(
    $.keyword_grant,
    comma_list($.identifier, true),
    $.keyword_to,
    comma_list($.identifier, true),
  ),

  // REVOKE role [, role] FROM user [, user]  (ClickHouse role-revoke, no ON clause)
  ch_revoke_statement: $ => seq(
    $.keyword_revoke,
    comma_list($.identifier, true),
    $.keyword_from,
    comma_list($.identifier, true),
  ),

  // CREATE QUOTA name KEYED BY key
  //   FOR INTERVAL n unit MAX k=v [, k=v]
  //   [FOR INTERVAL ...]
  //   TO role
  create_quota_statement: $ => seq(
    $.keyword_create,
    $.keyword_quota,
    $.identifier,
    $.keyword_keyed,
    $.keyword_by,
    $.identifier,
    repeat1(seq(
      $.keyword_for,
      $.keyword_interval,
      alias($._integer, $.literal),
      $.identifier,
      $.keyword_max,
      comma_list(seq($.identifier, '=', alias($._integer, $.literal)), true),
    )),
    $.keyword_to,
    comma_list($.identifier, true),
  ),

  // CREATE ROW POLICY [IF NOT EXISTS] name ON table
  //   [AS PERMISSIVE|RESTRICTIVE]
  //   FOR SELECT USING expr
  //   TO roles
  create_row_policy_statement: $ => seq(
    $.keyword_create,
    $.keyword_row,
    $.keyword_policy,
    optional($._if_not_exists),
    $.identifier,
    $.keyword_on,
    $.object_reference,
    optional(seq(
      $.keyword_as,
      choice($.keyword_permissive, $.keyword_restrictive),
    )),
    $.keyword_for,
    $.keyword_select,
    $.keyword_using,
    $._expression,
    $.keyword_to,
    comma_list($.identifier, true),
  ),

  // CREATE SETTINGS PROFILE name SETTINGS k = v [MAX v] [, ...] TO role
  // CREATE SETTINGS PROFILE [IF NOT EXISTS | OR REPLACE] name [ON CLUSTER c]
  //   [SETTINGS <setting> [,...]] [TO role [,...]]
  create_settings_profile_statement: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_settings,
    $.keyword_profile,
    optional(choice($._if_not_exists, $._or_replace)),
    comma_list($.identifier, true),
    optional($.on_cluster),
    optional(seq($.keyword_settings, comma_list($._ch_setting, true))),
    optional(seq($.keyword_to, comma_list($.identifier, true))),
  )),

  // SETTINGS k = v [, ...]  (inline settings clause used by CREATE USER)
  ch_settings_clause: $ => seq(
    $.keyword_settings,
    comma_list(seq($.identifier, '=', $._expression), true),
  ),

  // BACKUP TABLE|DATABASE|... target TO Disk(...) [SETTINGS ...]
  backup_statement: $ => seq(
    $.keyword_backup,
    $._backup_target,
    optional($.on_cluster),
    $.keyword_to,
    $._backup_destination,
    optional($.ch_settings_clause),
  ),

  // RESTORE TABLE|DATABASE|... target FROM Disk(...) [SETTINGS ...]
  restore_statement: $ => seq(
    $.keyword_restore,
    $._backup_target,
    optional($.on_cluster),
    $.keyword_from,
    $._backup_destination,
    optional($.ch_settings_clause),
  ),

  _backup_target: $ => comma_list(
    choice(
      seq(
        choice(
          $.keyword_table,
          $.keyword_dictionary,
          $.keyword_view,
          $.keyword_database,
        ),
        $.object_reference,
      ),
      $.keyword_all,
    ),
    true,
  ),

  _backup_destination: $ => choice(
    $.invocation,
    alias($._literal_string, $.literal),
  ),

};
