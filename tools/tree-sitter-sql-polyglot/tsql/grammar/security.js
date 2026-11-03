import { comma_list } from '../../grammar/helpers.js';

export default {

  // CREATE SYNONYM [schema.]name FOR [server.][db.][schema.]object
  create_synonym_statement: $ => seq(
    $.keyword_create,
    $.keyword_synonym,
    field('name', $.object_reference),
    $.keyword_for,
    field('target', $.object_reference),
  ),

  // DROP SYNONYM [IF EXISTS] [schema.]name
  drop_synonym_statement: $ => seq(
    $.keyword_drop,
    $.keyword_synonym,
    optional($._if_exists),
    field('name', $.object_reference),
  ),

  // CREATE LOGIN name [WITH option [, …]]
  create_login_statement: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_login,
    field('name', $.identifier),
    optional(seq($.keyword_with, comma_list($.login_option, true))),
  )),

  login_option: $ => choice(
    seq(
      $.keyword_password,
      '=',
      alias($._literal_string, $.literal),
      optional($.keyword_must_change),
    ),
    seq(
      field('option', $.identifier),
      '=',
      choice($.keyword_on, $.keyword_off, $.identifier, $.literal),
    ),
  ),

  // ALTER LOGIN name {WITH option [, …] | DISABLE | ENABLE}
  alter_login_statement: $ => seq(
    $.keyword_alter,
    $.keyword_login,
    field('name', $.identifier),
    choice(
      seq($.keyword_with, comma_list($.login_option, true)),
      $.keyword_disable,
      $.keyword_enable,
    ),
  ),

  // DROP LOGIN name
  drop_login_statement: $ => seq(
    $.keyword_drop,
    $.keyword_login,
    field('name', $.identifier),
  ),

  // CREATE USER name [FOR LOGIN login | WITHOUT LOGIN] [WITH option [, …]]
  create_user_statement: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_user,
    field('name', $.identifier),
    optional(choice(
      seq($.keyword_for, $.keyword_login, $.identifier),
      seq($.keyword_without, $.keyword_login),
    )),
    optional(seq($.keyword_with, comma_list($.user_option, true))),
  )),

  // DEFAULT_SCHEMA = dbo, NAME = alicia, …
  user_option: $ => seq(
    field('option', $.identifier),
    '=',
    choice($.identifier, $.literal),
  ),

  // ALTER USER name WITH option [, …]
  alter_user_statement: $ => seq(
    $.keyword_alter,
    $.keyword_user,
    field('name', $.identifier),
    $.keyword_with,
    comma_list($.user_option, true),
  ),

  // DROP USER [IF EXISTS] name
  drop_user_statement: $ => seq(
    $.keyword_drop,
    $.keyword_user,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  // Narrow base role rules to ROLE/GROUP; CREATE/ALTER/DROP USER are handled
  // by the T-SQL-specific rules above.
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

};
