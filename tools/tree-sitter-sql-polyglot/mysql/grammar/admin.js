import { comma_list, optional_parenthesis } from '../../grammar/helpers.js';

export default {

  // MySQL: SELECT … FOR UPDATE/SHARE [OF tbl] [NOWAIT | SKIP LOCKED]
  //        SELECT … LOCK IN SHARE MODE
  _select_statement: $ => optional_parenthesis(
    seq(
      $.select,
      optional(
        seq(
          $.keyword_into,
          $.select_expression,
        ),
      ),
      optional($.from),
      repeat($.locking_clause),
    ),
  ),

  locking_clause: $ => choice(
    seq(
      $.keyword_for,
      choice($.keyword_update, $.keyword_share),
      optional(seq($.keyword_of, comma_list($.object_reference, true))),
      optional(
        choice(
          $.keyword_nowait,
          seq($.keyword_skip, $.keyword_locked),
        ),
      ),
    ),
    seq($.keyword_lock, $.keyword_in, $.keyword_share, $.keyword_mode),
  ),

  // SET [scope] var = expr [, [scope] var = expr …]
  // SET NAMES charset [COLLATE collation] / SET CHARACTER SET charset
  set_variable_statement: $ => prec(1, seq(
    $.keyword_set,
    choice(
      seq(
        $.keyword_names,
        choice($.identifier, alias($._literal_string, $.literal)),
        optional(seq(
          $.keyword_collate,
          choice($.identifier, alias($._literal_string, $.literal)),
        )),
      ),
      seq(
        $.keyword_character,
        $.keyword_set,
        choice($.identifier, alias($._literal_string, $.literal)),
      ),
      comma_list($.set_assignment, true),
    ),
  )),

  set_assignment: $ => seq(
    optional(
      choice(
        $.keyword_global,
        $.keyword_session,
        $.keyword_local,
        $.keyword_persist,
        $.keyword_persist_only,
      ),
    ),
    field('target', choice(
      // @@GLOBAL.var / @@SESSION.var / @var / @@var
      seq($.user_variable, optional(seq('.', $.identifier))),
      alias($._qualified_field, $.field),
      $.identifier,
    )),
    '=',
    field('value', $._expression),
  ),

  // Narrow base create_role to ROLE/GROUP only; CREATE USER is handled by
  // create_user_statement with full MySQL account/auth syntax.
  create_role: $ => prec.left(seq(
    $.keyword_create,
    choice(
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

  // Narrow base alter_role/drop_role the same way.
  alter_role: $ => prec.left(seq(
    $.keyword_alter,
    choice(
      $.keyword_role,
      $.keyword_group,
    ),
    choice($.identifier, $.keyword_all),
    choice(
      $.rename_object,
      seq(optional($.keyword_with), repeat($._role_options)),
      seq(
        optional(seq($.keyword_in, $.keyword_database, $.identifier)),
        choice(
          seq(
            $.keyword_set,
            $.set_configuration,
          ),
          seq(
            $.keyword_reset,
            choice(
              $.keyword_all,
              field('option', $.identifier),
            )),
        ),
      )
    ),
  )),

  drop_role: $ => seq(
    $.keyword_drop,
    choice(
      $.keyword_group,
      $.keyword_role,
    ),
    optional($._if_exists),
    $.identifier,
  ),

  // 'user'@'host' | user@host | user | CURRENT_USER
  account_name: $ => seq(
    choice($.identifier, alias($._literal_string, $.literal)),
    optional(seq(
      '@',
      choice($.identifier, alias($._literal_string, $.literal)),
    )),
  ),

  // CREATE USER [IF NOT EXISTS] account [auth] [, …]
  create_user_statement: $ => seq(
    $.keyword_create,
    $.keyword_user,
    optional($._if_not_exists),
    comma_list(
      seq($.account_name, optional($._user_auth_option)),
      true,
    ),
  ),

  // IDENTIFIED BY 'pw' | IDENTIFIED WITH plugin [BY 'pw']
  _user_auth_option: $ => seq(
    $.keyword_identified,
    choice(
      seq($.keyword_by, alias($._literal_string, $.literal)),
      seq(
        $.keyword_with,
        $.identifier,
        optional(seq($.keyword_by, alias($._literal_string, $.literal))),
      ),
    ),
  ),

  // ALTER USER [IF EXISTS] account {auth | PASSWORD EXPIRE | ACCOUNT LOCK/UNLOCK}
  alter_user_statement: $ => seq(
    $.keyword_alter,
    $.keyword_user,
    optional($._if_exists),
    $.account_name,
    choice(
      $._user_auth_option,
      seq($.keyword_password, $.keyword_expire),
      seq($.keyword_account, choice($.keyword_lock, $.keyword_unlock)),
    ),
  ),

  // DROP USER [IF EXISTS] account [, …]
  drop_user_statement: $ => seq(
    $.keyword_drop,
    $.keyword_user,
    optional($._if_exists),
    comma_list($.account_name, true),
  ),

  // RENAME USER old TO new [, …]
  rename_user_statement: $ => seq(
    $.keyword_rename,
    $.keyword_user,
    comma_list(
      seq($.account_name, $.keyword_to, $.account_name),
      true,
    ),
  ),

  // REPAIR [NO_WRITE_TO_BINLOG | LOCAL] TABLE t [, …] [QUICK] [EXTENDED] [USE_FRM]
  repair_table_statement: $ => prec.right(seq(
    $.keyword_repair,
    optional(choice($.keyword_no_write_to_binlog, $.keyword_local)),
    $.keyword_table,
    comma_list($.object_reference, true),
    repeat(choice($.keyword_quick, $.keyword_extended, $.keyword_use_frm)),
  )),

  // CHECK TABLE t [, …] [option …] [FOR UPGRADE]
  check_table_statement: $ => prec.right(seq(
    $.keyword_check,
    $.keyword_table,
    comma_list($.object_reference, true),
    repeat(
      choice(
        $.keyword_quick,
        $.keyword_fast,
        $.keyword_medium,
        $.keyword_extended,
        $.keyword_changed,
        seq($.keyword_for, $.keyword_upgrade),
      ),
    ),
  )),

  // ANALYZE [NO_WRITE_TO_BINLOG | LOCAL] TABLE t [, …]
  //   [UPDATE HISTOGRAM ON cols [WITH n BUCKETS] | DROP HISTOGRAM ON cols]
  analyze_table_statement: $ => prec.right(1, seq(
    $.keyword_analyze,
    optional(choice($.keyword_no_write_to_binlog, $.keyword_local)),
    $.keyword_table,
    comma_list($.object_reference, true),
    optional(
      choice(
        seq(
          $.keyword_update,
          $.keyword_histogram,
          $.keyword_on,
          comma_list($.identifier, true),
          optional(seq(
            $.keyword_with,
            alias($._integer, $.literal),
            $.keyword_buckets,
          )),
        ),
        seq(
          $.keyword_drop,
          $.keyword_histogram,
          $.keyword_on,
          comma_list($.identifier, true),
        ),
      ),
    ),
  )),

  // PREPARE stmt FROM {'sql text' | @user_var}
  prepare_statement: $ => seq(
    $.keyword_prepare,
    field('name', $.identifier),
    $.keyword_from,
    choice(
      alias($._literal_string, $.literal),
      $.user_variable,
    ),
  ),

  // EXECUTE stmt [USING @var [, @var …]]
  execute_statement: $ => seq(
    $.keyword_execute,
    field('name', $.identifier),
    optional(seq($.keyword_using, comma_list($.user_variable, true))),
  ),

  // {DEALLOCATE | DROP} PREPARE stmt
  deallocate_statement: $ => seq(
    choice($.keyword_deallocate, $.keyword_drop),
    $.keyword_prepare,
    field('name', $.identifier),
  ),

};
