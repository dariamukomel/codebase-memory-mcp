import { comma_list, paren_list } from '../../grammar/helpers.js';

// ClickHouse statements that had no rule at all. Shapes are transcribed from
// the syntax line of each statement's page under
// https://clickhouse.com/docs/sql-reference/statements/
//
// Kept deliberately compact: this grammar's LR table already sits at the edge
// of the CI runner's memory budget, so each rule here is a fixed keyword-led
// shape with no new expression-level constructs.
export default {

  // CHECK TABLE t [PARTITION expr | PART expr]
  // CHECK GRANT priv [(col, …)] [, …] ON target
  check_statement: $ => prec.right(seq(
    $.keyword_check,
    choice(
      seq(
        $.keyword_table,
        field('table', $.object_reference),
        optional(seq(
          choice($.keyword_partition, $.keyword_part),
          field('partition', $._expression),
        )),
      ),
      seq(
        $.keyword_grant,
        comma_list($.ch_check_privilege, true),
        $.keyword_on,
        field('target', $.object_reference),
      ),
    ),
  )),

  ch_check_privilege: $ => seq(
    field('privilege', $.identifier),
    optional(paren_list($.identifier, true)),
  ),

  // { DESC | DESCRIBE } [TABLE] { table | query }
  describe_statement: $ => seq(
    choice($.keyword_describe, $.keyword_desc),
    optional($.keyword_table),
    choice($._dml_read, field('table', $.object_reference)),
  ),

  // EXISTS [TEMPORARY] [TABLE | DICTIONARY | DATABASE | VIEW] name
  exists_statement: $ => seq(
    $.keyword_exists,
    optional($.keyword_temporary),
    optional(choice(
      $.keyword_table,
      $.keyword_dictionary,
      $.keyword_database,
      $.keyword_view,
    )),
    field('name', $.object_reference),
  ),

  // MOVE { USER | ROLE | QUOTA | SETTINGS PROFILE | ROW POLICY } n [, …]
  //   TO storage
  move_access_statement: $ => seq(
    $.keyword_move,
    choice(
      $.keyword_user,
      $.keyword_role,
      $.keyword_quota,
      seq($.keyword_settings, $.keyword_profile),
      seq($.keyword_row, $.keyword_policy),
    ),
    comma_list($.object_reference, true),
    $.keyword_to,
    field('storage', $.identifier),
  ),

  // SET ROLE { DEFAULT | NONE | ALL [EXCEPT r, …] | r [, …] }
  // SET DEFAULT ROLE { … } TO user [, …]
  set_role_statement: $ => prec.right(seq(
    $.keyword_set,
    choice(
      seq($.keyword_role, $._role_selection),
      seq(
        $.keyword_default,
        $.keyword_role,
        $._role_selection,
        $.keyword_to,
        comma_list(field('user', $.object_reference), true),
      ),
    ),
  )),

  _role_selection: $ => choice(
    $.keyword_default,
    $.keyword_none,
    seq(
      $.keyword_all,
      optional(seq($.keyword_except, comma_list($.object_reference, true))),
    ),
    comma_list($.object_reference, true),
  ),

  // UNDROP TABLE [db.]name [UUID 'x'] [ON CLUSTER c]
  undrop_statement: $ => prec.right(seq(
    $.keyword_undrop,
    $.keyword_table,
    field('name', $.object_reference),
    optional(seq($.keyword_uuid, alias($._literal_string, $.literal))),
    optional($.on_cluster),
  )),

  // CREATE NAMED COLLECTION [IF NOT EXISTS] n [ON CLUSTER c]
  //   AS k = 'v' [[NOT] OVERRIDABLE] [, …]
  // ALTER / DROP NAMED COLLECTION follow the same head.
  named_collection_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter, $.keyword_drop),
    $.keyword_named,
    $.keyword_collection,
    optional(choice($._if_not_exists, $._if_exists)),
    field('name', $.object_reference),
    optional($.on_cluster),
    optional(seq($.keyword_as, comma_list($.named_collection_option, true))),
  )),

  named_collection_option: $ => prec.right(seq(
    field('key', $.identifier),
    '=',
    field('value', choice($.literal, $.identifier)),
    optional(seq(optional($.keyword_not), $.keyword_overridable)),
  )),

  // CREATE MASKING POLICY [IF NOT EXISTS | OR REPLACE] p ON [db.]t
  //   UPDATE col = expr [, …] [WHERE cond] TO { r [, …] | ALL [EXCEPT r …] }
  // ALTER / DROP MASKING POLICY share the head.
  masking_policy_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter, $.keyword_drop),
    $.keyword_masking,
    $.keyword_policy,
    optional(choice($._if_not_exists, $._if_exists, $._or_replace)),
    field('name', $.object_reference),
    optional(seq($.keyword_on, field('table', $.object_reference))),
    optional(seq($.keyword_update, $.assignment_list)),
    optional($.where),
    optional(seq($.keyword_to, $._role_selection)),
  )),

};
