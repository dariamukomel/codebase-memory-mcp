// Non-ISO ALTER syntax this dialect accepts (the former shared base rules, kept as this dialect's own
// copy). ISO 9075 has only ALTER TABLE (one action), ALTER TYPE (ADD/DROP ATTRIBUTE), ALTER SEQUENCE
// (RESTART / INCREMENT BY / MAXVALUE / MINVALUE / CYCLE), ALTER DOMAIN, ALTER ROUTINE and ALTER
// TRANSFORM. IF EXISTS, ONLY, comma-separated actions, MODIFY/CHANGE COLUMN, column positions,
// ROW LEVEL SECURITY, RENAME, OWNER TO, ALTER VIEW/INDEX/SCHEMA/DATABASE/ROLE are vendor syntax.
// Spread first into `rules` so the dialect's own rules override it.
import { paren_list, comma_list, make_keyword } from "../../grammar/helpers.js";

export default {

  // keywords only the rules below use; defined here, not in the ISO base
  keyword_change: _ => make_keyword("change"),
  keyword_disable: _ => make_keyword("disable"),
  keyword_enable: _ => make_keyword("enable"),
  keyword_logged: _ => make_keyword("logged"),
  keyword_modify: _ => make_keyword("modify"),
  keyword_owner: _ => make_keyword("owner"),
  keyword_value: _ => make_keyword("value"),

  _alter_statement: $ => seq(
    choice(
      $.alter_table,
      $.alter_view,
      $.alter_materialized_view,
      $.alter_schema,
      $.alter_type,
      $.alter_index,
      $.alter_database,
      $.alter_role,
      $.alter_sequence,
    ),
  ),

  alter_table: $ => seq(
    $.keyword_alter,
    $.keyword_table,
    optional($._if_exists),
    optional($.keyword_only),
    field("target", $.object_reference),
    choice(
      seq(
        $._alter_specifications,
        repeat(
          seq(
            ",",
            $._alter_specifications
          )
        )
      ),
      seq(
        choice(
          $.keyword_enable,
          $.keyword_disable,
          seq(optional($.keyword_no), $.keyword_force),
        ),
        $.keyword_row,
        $.keyword_level,
        $.keyword_security,
      ),
    ),
  ),

  _alter_specifications: $ => choice(
    $.add_column,
    $.add_constraint,
    $.drop_constraint,
    $.alter_column,
    $.modify_column,
    $.change_column,
    $.drop_column,
    $.rename_object,
    $.rename_column,
    $.set_schema,
    $.change_ownership,
  ),

  // TODO: optional `keyword_add` is necessary to allow for chained alter statements in t-sql
  // maybe needs refactoring
  add_column: $ => seq(
    optional($.keyword_add),
    optional(
      $.keyword_column,
    ),
    optional($._if_not_exists),
    $.column_definition,
    optional($.column_position),
  ),

  add_constraint: $ => seq(
    $.keyword_add,
    optional($.keyword_constraint),
    $.identifier,
    $.constraint,
  ),

  drop_constraint: $ => seq(
    $.keyword_drop,
    $.keyword_constraint,
    optional($._if_exists),
    $.identifier,
    optional($._drop_behavior),
  ),

  alter_column: $ => seq(
    $.keyword_alter,
    optional($.keyword_column),
    field('name', $.identifier),
    choice(
      seq(
        choice($.keyword_set, $.keyword_drop),
        $.keyword_not,
        $.keyword_null,
      ),
      seq(
        optional(seq($.keyword_set, $.keyword_data)),
        $.keyword_type,
        field('type', $._type),
      ),
      seq($.keyword_set, $.keyword_default, $._expression),
      seq($.keyword_drop, $.keyword_default),
    ),
  ),

  modify_column: $ => seq(
    $.keyword_modify,
    optional(
      $.keyword_column,
    ),
    optional($._if_exists),
    $.column_definition,
    optional($.column_position),
  ),

  change_column: $ => seq(
    $.keyword_change,
    optional(
      $.keyword_column,
    ),
    optional($._if_exists),
    field('old_name', $.identifier),
    $.column_definition,
    optional($.column_position),
  ),

  column_position: $ => choice(
    $.keyword_first,
    seq(
      $.keyword_after,
      field('col_name', $.identifier),
    ),
  ),

  drop_column: $ => seq(
    $.keyword_drop,
    optional(
      $.keyword_column,
    ),
    optional($._if_exists),
    field('name', $.identifier),
    repeat(seq(',', field('name', $.identifier))),
  ),

  rename_column: $ => seq(
    $.keyword_rename,
    optional(
      $.keyword_column,
    ),
    field('old_name', $.identifier),
    $.keyword_to,
    field('new_name', $.identifier),
  ),

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
    ),
  ),

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
    ),
  ),

  alter_schema: $ => seq(
    $.keyword_alter,
    $.keyword_schema,
    $.identifier,
    choice(
      $.keyword_rename,
      $.keyword_owner,
    ),
    $.keyword_to,
    $.identifier,
  ),

  alter_database: $ => seq(
    $.keyword_alter,
    $.keyword_database,
    $.identifier,
    optional($.keyword_with),
    choice(
      seq($.rename_object),
      seq($.change_ownership),
      seq(
        $.keyword_reset,
        choice(
          $.keyword_all,
          field('configuration_parameter', $.identifier)
        ),
      ),
      seq(
        $.keyword_set,
        choice(
          seq($.keyword_tablespace, $.identifier),
            $.set_configuration,
          ),
        ),
      ),
    ),

  alter_role: $ => prec.left(seq(
    $.keyword_alter,
    choice(
      $.keyword_role,
      $.keyword_group,
      $.keyword_user,
    ),
    choice($.identifier, $.keyword_all),
    choice(
      $.rename_object,
      seq(optional($.keyword_with),repeat($._role_options)),
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

  set_configuration: $ => seq(
    field('option', $.identifier),
    choice(
      seq($.keyword_from, $.keyword_current),
      seq(
        choice($.keyword_to, "="),
        choice(
          field('parameter', $.identifier),
          $.literal,
          $.keyword_default
        )
      )
    ),
  ),

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
          paren_list(seq($.identifier, '=', field('value', $.literal)))
        ),
      ),
    ),
  ),

  alter_sequence: $ => seq(
    $.keyword_alter,
    $.keyword_sequence,
    optional($._if_exists),
    $.object_reference,
    choice(
      repeat1(
        choice(
          seq($.keyword_as, $._type),
          seq($.keyword_increment, optional($.keyword_by), $.literal),
          seq($.keyword_minvalue, choice($.literal, seq($.keyword_no, $.keyword_minvalue))),
          seq($.keyword_maxvalue, choice($.literal, seq($.keyword_no, $.keyword_maxvalue))),
          seq($.keyword_start, optional($.keyword_with), field('start', alias($._integer, $.literal))),
          seq($.keyword_restart, optional($.keyword_with), field('restart', alias($._integer, $.literal))),
          seq($.keyword_cache, field('cache', alias($._integer, $.literal))),
          seq(optional($.keyword_no), $.keyword_cycle),
          seq($.keyword_owned, $.keyword_by, choice($.keyword_none, $.object_reference)),
        ),
      ),
      $.rename_object,
      $.change_ownership,
      seq(
        $.keyword_set,
        choice(
          choice($.keyword_logged, $.keyword_unlogged),
          seq($.keyword_schema, $.identifier)
        ),
      ),
    ),
  ),

  alter_type: $ => seq(
    $.keyword_alter,
    $.keyword_type,
    $.identifier,
    choice(
      $.change_ownership,
      $.set_schema,
      $.rename_object,
      seq(
        $.keyword_rename,
        $.keyword_attribute,
        $.identifier,
        $.keyword_to,
        $.identifier,
        optional($._drop_behavior)
      ),
      seq(
        $.keyword_add,
        $.keyword_value,
        optional($._if_not_exists),
          alias($._single_quote_string,$.literal),
        optional(
          seq(
            choice($.keyword_before, $.keyword_after),
            alias($._single_quote_string,$.literal),
          )
        ),
      ),
      seq(
        $.keyword_rename,
        $.keyword_value,
        alias($._single_quote_string,$.literal),
        $.keyword_to,
        alias($._single_quote_string,$.literal),
      ),
      seq(
        choice(
          seq(
            $.keyword_add,
            $.keyword_attribute,
            $.identifier,
            $._type
          ),
          seq($.keyword_drop,
            $.keyword_attribute,
            optional($._if_exists),
            $.identifier),
          seq(
            $.keyword_alter,
            $.keyword_attribute,
            $.identifier,
            optional(seq($.keyword_set, $.keyword_data)),
            $.keyword_type,
            $._type
          ),
        ),
        optional(seq($.keyword_collate, $.identifier)),
        optional($._drop_behavior)
      )
    ),
  ),

  _drop_behavior: $ => choice(
    $.keyword_cascade,
    $.keyword_restrict,
  ),

  rename_object: $ => seq(
    $.keyword_rename,
    $.keyword_to,
    $.object_reference,
  ),

  set_schema: $ => seq(
    $.keyword_set,
    $.keyword_schema,
    field('schema', $.identifier),
  ),

  change_ownership: $ => seq(
    $.keyword_owner,
    $.keyword_to,
    $.identifier,
  ),

};
