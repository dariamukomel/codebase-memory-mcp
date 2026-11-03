import { comma_list, paren_list } from '../../grammar/helpers.js';

// Clause completions from the Amazon Redshift developer guide (583 statement
// pages, enumerated from the docs TOC). Each override reproduces the
// inherited body; an override replaces the parent rule wholesale.
export default {

  // ALTER MATERIALIZED VIEW name
  //   { AUTO REFRESH {YES|NO} | ALTER DISTKEY c | ALTER DISTSTYLE ...
  //   | ALTER [COMPOUND] SORTKEY (...) | ALTER SORTKEY {AUTO|NONE}
  //   | ROW LEVEL SECURITY {ON|OFF} [CONJUNCTION TYPE {AND|OR}]
  //     [FOR DATASHARES] }
  alter_materialized_view: $ => seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      $.set_schema,
      $.change_ownership,
      seq($.keyword_auto, $.keyword_refresh, choice($.keyword_yes, $.keyword_no)),
      seq($.keyword_alter, $.keyword_distkey, field('column', $.identifier)),
      seq(
        $.keyword_alter,
        $.keyword_diststyle,
        choice(
          $.keyword_all,
          $.keyword_even,
          $.keyword_auto,
          seq($.keyword_key, $.keyword_distkey, field('column', $.identifier)),
        ),
      ),
      seq(
        $.keyword_alter,
        optional($.keyword_compound),
        $.keyword_sortkey,
        choice(
          paren_list($.identifier, true),
          $.keyword_auto,
          $.keyword_none,
        ),
      ),
      seq(
        $.keyword_row,
        $.keyword_level,
        $.keyword_security,
        choice($.keyword_on, $.keyword_off),
        optional(seq($.keyword_conjunction, $.keyword_type,
                     choice($.keyword_and, $.keyword_or))),
        optional(seq($.keyword_for, $.keyword_datashares)),
      ),
    ),
  ),

  // ALTER DATABASE name
  //   { RENAME TO n | OWNER TO o | CONNECTION LIMIT ... | COLLATE ...
  //   | ISOLATION LEVEL ... | INTEGRATION { REFRESH ... | SET <options> } }
  alter_database: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_database,
    $.identifier,
    choice(
      $.rename_object,
      $.change_ownership,
      repeat1($._redshift_db_option),
      seq(
        $.keyword_integration,
        choice(
          seq(
            $.keyword_refresh,
            choice(
              seq(
                choice($.keyword_all, $.keyword_inerror),
                $.keyword_tables,
                optional(seq($.keyword_in, $.keyword_schema,
                             comma_list($.identifier, true))),
              ),
              seq($.keyword_table, comma_list($.object_reference, true)),
            ),
          ),
          seq($.keyword_set, comma_list($.redshift_option, true)),
        ),
      ),
    ),
  )),

  // CREATE DATABASE db [WITH] [OWNER [=] u] [CONNECTION LIMIT n]
  //   [COLLATE …] [ISOLATION LEVEL …]
  // Redshift's own option list, in place of the base rule's generic
  // `name [=] value` settings; the same options ALTER DATABASE accepts,
  // plus OWNER.
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    field('name', $.identifier),
    optional($.keyword_with),
    repeat(choice(
      // OWNER lives here rather than in _redshift_db_option: ALTER DATABASE
      // reuses that rule alongside change_ownership (OWNER TO …), and both
      // starting with OWNER would put the two in conflict.
      seq($.keyword_owner, optional('='), field('owner', $.identifier)),
      $._redshift_db_option,
    )),
  )),

  _redshift_db_option: $ => choice(
    seq($.keyword_connection, $.keyword_limit,
        field('limit', choice($.literal, $.keyword_unlimited))),
    seq($.keyword_collate, field('collation', $.identifier)),
    seq($.keyword_isolation, $.keyword_level,
        field('isolation', choice($.keyword_snapshot, $.keyword_serializable))),
  ),

  // The integration option list is open ended and version specific.
  redshift_option: $ => seq(
    field('name', $.identifier),
    optional('='),
    field('value', choice($.literal, $.identifier)),
  ),

};
