import { comma_list, paren_list } from '../../grammar/helpers.js';

// Statements that already had a rule but covered only part of the syntax the
// MySQL 8.4 reference documents. Each override reproduces the inherited body
// and adds the missing clauses; an override replaces the parent wholesale.
export default {

  // ALTER [ALGORITHM = {UNDEFINED | MERGE | TEMPTABLE}] [DEFINER = user]
  //   [SQL SECURITY {DEFINER | INVOKER}] VIEW name [(cols)] AS select
  //   [WITH [CASCADED | LOCAL] CHECK OPTION]
  // The modifiers sit between ALTER and VIEW, so the whole rule is replaced
  // rather than extended at the tail.
  alter_view: $ => seq(
    $.keyword_alter,
    optional($._view_algorithm),
    optional($._view_definer),
    optional($._view_sql_security),
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    optional(paren_list($.identifier, true)),
    choice(
      $.rename_object,
      $.rename_column,
      $.set_schema,
      $.change_ownership,
      seq(
        $.keyword_as,
        $._dml_read,
        optional($._view_check_option),
      ),
    ),
  ),

  _view_algorithm: $ => seq(
    $.keyword_algorithm,
    '=',
    field('algorithm', choice(
      $.keyword_undefined,
      $.keyword_merge,
      $.keyword_temptable,
    )),
  ),

  _view_definer: $ => seq(
    $.keyword_definer,
    '=',
    field('definer', choice($.object_reference, $.literal)),
  ),

  _view_sql_security: $ => seq(
    $.keyword_sql,
    $.keyword_security,
    field('security', choice($.keyword_definer, $.keyword_invoker)),
  ),

  _view_check_option: $ => seq(
    $.keyword_with,
    optional(choice($.keyword_cascaded, $.keyword_local)),
    $.keyword_check,
    $.keyword_option,
  ),

  // CREATE {DATABASE | SCHEMA} [IF NOT EXISTS] db [create_option] …
  //   create_option: [DEFAULT] {CHARACTER SET [=] cs | COLLATE [=] col
  //                            | ENCRYPTION [=] {'Y' | 'N'}}
  // ALTER {DATABASE | SCHEMA} [db] {create_option | READ ONLY [=] …} …
  //
  // The options are enumerated rather than reused from base's `_with_settings`
  // (a generic `name [=] value` pair). The generic pair is what destabilised
  // MariaDB when this was first attempted: it collides with the statement
  // heads that begin with a bare identifier.
  _mysql_db_option: $ => choice(
    seq(
      optional($.keyword_default),
      choice(
        seq($.keyword_character, $.keyword_set, optional('='), field('charset', $.identifier)),
        seq($.keyword_collate, optional('='), field('collation', $.identifier)),
        seq(
          $.keyword_encryption,
          optional('='),
          field('encryption', alias($._literal_string, $.literal)),
        ),
      ),
    ),
    seq(
      $.keyword_read,
      $.keyword_only,
      optional('='),
      field('read_only', choice($.keyword_default, $.literal)),
    ),
  ),

  // DATABASE and SCHEMA stay separate rules rather than one rule with a
  // choice: base already defines create_schema/alter_schema and this dialect
  // lists both in its statement sets, so merging them would make the two
  // spellings ambiguous with each other.
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    field('name', $.identifier),
    repeat($._mysql_db_option),
  )),

  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    optional($._if_not_exists),
    field('name', $.identifier),
    repeat($._mysql_db_option),
  )),

  alter_database: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_database,
    optional(field('name', $.identifier)),
    repeat1($._mysql_db_option),
  )),

  alter_schema: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_schema,
    optional(field('name', $.identifier)),
    repeat1($._mysql_db_option),
  )),

  // DROP INDEX name ON table [ALGORITHM [=] {DEFAULT | INPLACE | COPY}]
  //   [LOCK [=] {DEFAULT | NONE | SHARED | EXCLUSIVE}]
  drop_index: $ => seq(
    $.keyword_drop,
    $.keyword_index,
    optional($._if_exists),
    field('name', $.identifier),
    optional(seq($.keyword_on, $.object_reference)),
    repeat($._index_ddl_option),
  ),

  _index_ddl_option: $ => choice(
    seq(
      $.keyword_algorithm,
      optional('='),
      field('algorithm', choice(
        $.keyword_default,
        $.keyword_inplace,
        $.keyword_copy,
      )),
    ),
    seq(
      $.keyword_lock,
      optional('='),
      field('lock', choice(
        $.keyword_default,
        $.keyword_none,
        $.keyword_shared,
        $.keyword_exclusive,
      )),
    ),
  ),

};
