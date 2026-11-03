import { comma_list, paren_list } from '../../grammar/helpers.js';

// T-SQL statements that had no rule at all. Every shape below is transcribed
// from the Syntax block of its own page under
// https://learn.microsoft.com/en-us/sql/t-sql/statements/statements
export default {

  _on_off: $ => choice($.keyword_on, $.keyword_off),

  // A `NAME = value` pair, the shape shared by the WITH (…) option lists.
  tsql_option: $ => seq(
    field('name', $.identifier),
    '=',
    field('value', choice($.literal, $.identifier, $._on_off)),
  ),

  // ── SET options ─────────────────────────────────────────────────────────
  // SET is the largest statement family in T-SQL; roughly forty documented
  // options. They fall into three shapes; the existing set_statement covers
  // only the ANSI transaction forms and @variable assignment.
  // https://learn.microsoft.com/en-us/sql/t-sql/statements/set-statements-transact-sql
  set_option_statement: $ => prec.right(seq(
    $.keyword_set,
    choice(
      // SET STATISTICS { IO | TIME | XML | PROFILE } [, …] { ON | OFF }
      seq($.keyword_statistics, comma_list(field('option', $.identifier), true), $._on_off),
      // SET ANSI_NULLS, QUOTED_IDENTIFIER [, …] { ON | OFF }
      seq(comma_list(field('option', $.identifier), true), $._on_off),
      // SET DATEFIRST 7 | SET LANGUAGE us_english | SET IDENTITY_INSERT t ON
      // One branch rather than two: splitting the value-taking form from the
      // `option target ON|OFF` form makes the parser choose between reducing
      // the same identifier to two different symbols.
      seq(
        field('option', $.identifier),
        field('value', choice($.literal, $.object_reference, $.variable)),
        optional($._on_off),
      ),
    ),
  )),

  // ── Permissions ─────────────────────────────────────────────────────────

  // DENY { ALL [PRIVILEGES] | permission [(col, …)] [, …] }
  //   [ON [class ::] securable] TO principal [, …] [CASCADE] [AS principal]
  deny_statement: $ => prec.right(seq(
    $.keyword_deny,
    choice(
      seq($.keyword_all, optional($.keyword_privileges)),
      comma_list($.tsql_permission, true),
    ),
    optional(seq(
      $.keyword_on,
      optional(seq(field('class', $.identifier), '::')),
      field('securable', $.object_reference),
    )),
    $.keyword_to,
    comma_list(field('principal', $.identifier), true),
    optional($.keyword_cascade),
    optional(seq($.keyword_as, field('as_principal', $.identifier))),
  )),

  tsql_permission: $ => prec.right(seq(
    field('permission', choice(
      $.keyword_select,
      $.keyword_insert,
      $.keyword_update,
      $.keyword_delete,
      $.keyword_execute,
      $.keyword_references,
      $.keyword_alter,
      $.keyword_control,
      $.identifier,
    )),
    optional(paren_list($.identifier, true)),
  )),

  // EXECUTE AS { LOGIN | USER } = 'name' [WITH …] | EXECUTE AS CALLER
  execute_as_statement: $ => prec.right(seq(
    choice($.keyword_exec, $.keyword_execute),
    $.keyword_as,
    choice(
      $.keyword_caller,
      seq(
        choice($.keyword_login, $.keyword_user),
        '=',
        alias($._literal_string, $.literal),
        optional(seq(
          $.keyword_with,
          choice(
            seq($.keyword_no, $.keyword_revert),
            seq($.keyword_cookie, $.keyword_into, $.variable),
          ),
        )),
      ),
    ),
  )),

  // REVERT [WITH COOKIE = @var]
  revert_statement: $ => prec.right(seq(
    $.keyword_revert,
    optional(seq($.keyword_with, $.keyword_cookie, '=', $.variable)),
  )),

  // SETUSER ['username' [WITH NORESET]]
  setuser_statement: $ => prec.right(seq(
    $.keyword_setuser,
    optional(seq(
      alias($._literal_string, $.literal),
      optional(seq($.keyword_with, field('option', $.identifier))),
    )),
  )),

  // ── Triggers and statistics ─────────────────────────────────────────────

  // { ENABLE | DISABLE } TRIGGER { name [, …] | ALL }
  //   ON { object | DATABASE | ALL SERVER }
  enable_trigger_statement: $ => seq(
    choice($.keyword_enable, $.keyword_disable),
    $.keyword_trigger,
    choice($.keyword_all, comma_list(field('name', $.object_reference), true)),
    $.keyword_on,
    choice(
      $.keyword_database,
      seq($.keyword_all, $.keyword_server),
      field('object', $.object_reference),
    ),
  ),

  // UPDATE STATISTICS table [ name | (name, …) ] [WITH option [, …]]
  update_statistics_statement: $ => prec.right(seq(
    $.keyword_update,
    $.keyword_statistics,
    field('table', $.object_reference),
    optional(choice(
      paren_list(field('name', $.identifier), true),
      field('name', $.identifier),
    )),
    optional(seq($.keyword_with, comma_list($._statistics_option, true))),
  )),

  // CREATE STATISTICS name ON table (col, …) [WHERE …] [WITH option [, …]]
  create_statistics: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_statistics,
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
    paren_list($.identifier, true),
    optional($.where),
    optional(seq($.keyword_with, comma_list($._statistics_option, true))),
  )),

  _statistics_option: $ => choice(
    // SAMPLE 50 PERCENT | SAMPLE 1000 ROWS
    seq(
      field('option', $.identifier),
      field('amount', $.literal),
      optional(choice($.keyword_percent, $.keyword_rows)),
    ),
    $.tsql_option,
    seq($.keyword_on, $.keyword_partitions, paren_list($.literal, true)),
    seq($.keyword_all, optional(field('scope', $.identifier))),
    field('option', $.identifier),
  ),

  // ── Backup and restore ──────────────────────────────────────────────────

  // BACKUP { DATABASE | LOG } name TO device [, …] [WITH option [, …]]
  // RESTORE { DATABASE | LOG } name [FROM device [, …]] [WITH option [, …]]
  backup_statement: $ => prec.right(seq(
    choice($.keyword_backup, $.keyword_restore),
    choice($.keyword_database, $.keyword_log),
    field('name', $.object_reference),
    optional(seq(
      choice($.keyword_to, $.keyword_from),
      comma_list($.backup_device, true),
    )),
    optional(seq($.keyword_with, comma_list($._backup_option, true))),
  )),

  // DISK = '…' | TAPE = '…' | URL = '…' | logical_device_name
  backup_device: $ => choice(
    seq(field('kind', $.identifier), '=', alias($._literal_string, $.literal)),
    field('name', $.identifier),
  ),

  _backup_option: $ => choice(
    $.tsql_option,
    seq($.keyword_no, field('option', $.identifier)),
    field('option', $.identifier),
  ),

  // ── Keys, certificates, credentials ─────────────────────────────────────

  // OPEN MASTER KEY DECRYPTION BY PASSWORD = '…'  |  CLOSE MASTER KEY
  // OPEN SYMMETRIC KEY k DECRYPTION BY …          |  CLOSE SYMMETRIC KEY k
  // CLOSE ALL SYMMETRIC KEYS
  //
  // MASTER, SYMMETRIC and ASYMMETRIC are matched as identifiers throughout
  // this file rather than promoted to keywords: `USE master;` is in the
  // corpus, and none of the three is reserved in T-SQL. The cost is that
  // `CLOSE anything KEY` parses; the benefit is that `master` stays usable as
  // the database name it actually is.
  open_key_statement: $ => prec.right(seq(
    choice($.keyword_open, $.keyword_close),
    choice(
      seq($.keyword_all, field('kind', $.identifier), field('keys', $.identifier)),
      seq(field('kind', $.identifier), $.keyword_key, optional(field('name', $.identifier))),
    ),
    optional(seq(
      $.keyword_decryption,
      $.keyword_by,
      choice(
        seq($.keyword_password, '=', alias($._literal_string, $.literal)),
        seq(field('mechanism', $.identifier), field('mechanism_name', $.identifier)),
      ),
    )),
  )),

  // CREATE MASTER KEY [ENCRYPTION BY PASSWORD = '…']
  // CREATE SYMMETRIC KEY k [AUTHORIZATION o] [FROM PROVIDER p] WITH option …
  // CREATE ASYMMETRIC KEY / CERTIFICATE / [DATABASE SCOPED] CREDENTIAL all
  // share the same `object name [AUTHORIZATION …] WITH option-list` skeleton,
  // so one rule covers them. MASTER KEY is the form with no name.
  create_key_object: $ => prec.right(seq(
    $.keyword_create,
    choice(
      seq(field('kind', $.identifier), $.keyword_key),
      $.keyword_certificate,
      seq(optional(seq($.keyword_database, $.keyword_scoped)), $.keyword_credential),
    ),
    optional(field('name', $.identifier)),
    optional(seq($.keyword_authorization, field('owner', $.identifier))),
    optional(seq($.keyword_from, field('source', $.identifier), field('source_name', $.identifier))),
    optional(seq($.keyword_with, comma_list($._key_option, true))),
    optional(seq(
      $.keyword_encryption,
      $.keyword_by,
      choice(
        seq($.keyword_password, '=', alias($._literal_string, $.literal)),
        seq(field('mechanism', $.identifier), field('mechanism_name', $.identifier)),
      ),
    )),
  )),

  _key_option: $ => choice(
    $.tsql_option,
    seq(
      $.keyword_encryption,
      $.keyword_by,
      $.keyword_password,
      '=',
      alias($._literal_string, $.literal),
    ),
    field('option', $.identifier),
  ),

  // ── Partitioning ────────────────────────────────────────────────────────

  // CREATE PARTITION FUNCTION f (type) AS RANGE [LEFT|RIGHT]
  //   FOR VALUES (v [, …])
  create_partition_function: $ => seq(
    $.keyword_create,
    $.keyword_partition,
    $.keyword_function,
    field('name', $.identifier),
    paren_list($._type, true),
    $.keyword_as,
    $.keyword_range,
    optional(choice($.keyword_left, $.keyword_right)),
    $.keyword_for,
    $.keyword_values,
    paren_list($._expression),
  ),

  // CREATE PARTITION SCHEME s AS PARTITION f [ALL] TO (fg [, …])
  create_partition_scheme: $ => seq(
    $.keyword_create,
    $.keyword_partition,
    $.keyword_scheme,
    field('name', $.identifier),
    $.keyword_as,
    $.keyword_partition,
    field('function', $.identifier),
    optional($.keyword_all),
    $.keyword_to,
    paren_list(choice($.keyword_primary, field('filegroup', $.identifier)), true),
  ),

  // ── Row-level security, defaults, rules ─────────────────────────────────

  // CREATE|ALTER SECURITY POLICY p ADD [FILTER|BLOCK] PREDICATE f(cols)
  //   ON table [AFTER …|BEFORE …] [, …] [WITH (…)] [NOT FOR REPLICATION]
  create_security_policy: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter),
    $.keyword_security,
    $.keyword_policy,
    field('name', $.object_reference),
    comma_list($.security_predicate, true),
    optional(seq($.keyword_with, paren_list($.tsql_option, true))),
    optional(seq($.keyword_not, $.keyword_for, $.keyword_replication)),
  )),

  security_predicate: $ => prec.right(seq(
    $.keyword_add,
    optional(choice($.keyword_filter, $.keyword_block)),
    $.keyword_predicate,
    field('function', $.object_reference),
    paren_list($._expression, true),
    $.keyword_on,
    field('table', $.object_reference),
    optional(seq(
      choice($.keyword_after, $.keyword_before),
      choice($.keyword_insert, $.keyword_update, $.keyword_delete),
    )),
  )),

  // CREATE DEFAULT name AS constant  |  CREATE RULE name AS condition
  create_default_or_rule: $ => seq(
    $.keyword_create,
    choice($.keyword_default, $.keyword_rule),
    field('name', $.object_reference),
    $.keyword_as,
    field('expression', $._expression),
  ),

  // ── Sensitivity classification ──────────────────────────────────────────

  // ADD SENSITIVITY CLASSIFICATION TO col [, …] WITH (option [, …])
  // Every documented option; LABEL, LABEL_ID, INFORMATION_TYPE,
  // INFORMATION_TYPE_ID, RANK; is a NAME = value pair, so tsql_option covers
  // them all; a separate rule for RANK duplicated it exactly and left a
  // reduce-reduce conflict.
  // DROP SENSITIVITY CLASSIFICATION FROM col [, …]
  sensitivity_classification_statement: $ => seq(
    choice($.keyword_add, $.keyword_drop),
    $.keyword_sensitivity,
    $.keyword_classification,
    choice($.keyword_to, $.keyword_from),
    comma_list(field('column', $.object_reference), true),
    optional(seq($.keyword_with, paren_list($.tsql_option, true))),
  ),

  // ── Server-level roles ──────────────────────────────────────────────────

  // CREATE SERVER ROLE r [AUTHORIZATION principal]
  // CREATE APPLICATION ROLE r WITH PASSWORD = '…' [, DEFAULT_SCHEMA = s]
  create_principal_role: $ => prec.right(seq(
    $.keyword_create,
    choice($.keyword_server, $.keyword_application),
    $.keyword_role,
    field('name', $.identifier),
    optional(seq($.keyword_authorization, field('owner', $.identifier))),
    optional(seq(
      $.keyword_with,
      comma_list(
        choice(
          seq($.keyword_password, '=', alias($._literal_string, $.literal)),
          $.tsql_option,
        ),
        true,
      ),
    )),
  )),

  // ── DROP for the object classes added above ─────────────────────────────

  // DROP { MASTER KEY | SYMMETRIC KEY | ASYMMETRIC KEY | CERTIFICATE
  //      | CREDENTIAL | PARTITION FUNCTION | PARTITION SCHEME
  //      | SECURITY POLICY | DEFAULT | RULE | STATISTICS
  //      | SERVER ROLE | APPLICATION ROLE } [IF EXISTS] name [, …]
  drop_tsql_object: $ => seq(
    $.keyword_drop,
    choice(
      seq(field('kind', $.identifier), $.keyword_key),
      $.keyword_certificate,
      seq(optional(seq($.keyword_database, $.keyword_scoped)), $.keyword_credential),
      seq($.keyword_partition, $.keyword_function),
      seq($.keyword_partition, $.keyword_scheme),
      seq($.keyword_security, $.keyword_policy),
      $.keyword_default,
      $.keyword_rule,
      $.keyword_statistics,
      seq($.keyword_server, $.keyword_role),
      seq($.keyword_application, $.keyword_role),
    ),
    optional($._if_exists),
    comma_list(field('name', $.object_reference), true),
  ),

};
