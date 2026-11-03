// ISO 9075 ALTER statements (section 11): ALTER TABLE, ALTER TYPE, ALTER SEQUENCE GENERATOR.
// Vendor ALTER syntax (IF EXISTS, ONLY, several comma-separated actions, MODIFY/CHANGE COLUMN,
// column positions, ROW LEVEL SECURITY, RENAME, OWNER TO, ALTER VIEW / INDEX / SCHEMA / DATABASE /
// ROLE, enum values, ...) lives in each dialect's own grammar/alter_vendor.js.

export default {

  _alter_statement: $ => choice(
    $.alter_table,
    $.alter_type,
    $.alter_sequence,
  ),

  // <alter table statement> ::= ALTER TABLE <table name> <alter table action>
  alter_table: $ => seq(
    $.keyword_alter,
    $.keyword_table,
    field('target', $.object_reference),
    $._alter_table_action,
  ),

  _alter_table_action: $ => choice(
    $.add_column,
    $.alter_column,
    $.drop_column,
    $.add_constraint,
    $.drop_constraint,
  ),

  // <add column definition> ::= ADD [ COLUMN ] <column definition>
  add_column: $ => seq(
    $.keyword_add,
    optional($.keyword_column),
    $.column_definition,
  ),

  // <alter column definition> ::= ALTER [ COLUMN ] <column name> <alter column action>
  alter_column: $ => seq(
    $.keyword_alter,
    optional($.keyword_column),
    field('name', $.identifier),
    choice(
      seq($.keyword_set, $.keyword_default, $._expression),
      seq($.keyword_drop, $.keyword_default),
      seq($.keyword_set, $.keyword_not, $.keyword_null),
      seq($.keyword_drop, $.keyword_not, $.keyword_null),
      seq($.keyword_set, $.keyword_data, $.keyword_type, field('type', $._type)),
    ),
  ),

  // <drop column definition> ::= DROP [ COLUMN ] <column name> <drop behavior>
  drop_column: $ => seq(
    $.keyword_drop,
    optional($.keyword_column),
    field('name', $.identifier),
    $._drop_behavior,
  ),

  // <add table constraint definition> ::= ADD <table constraint definition>
  add_constraint: $ => seq(
    $.keyword_add,
    $.constraint,
  ),

  // <drop table constraint definition> ::= DROP CONSTRAINT <constraint name> <drop behavior>
  drop_constraint: $ => seq(
    $.keyword_drop,
    $.keyword_constraint,
    $.identifier,
    $._drop_behavior,
  ),

  _drop_behavior: $ => choice(
    $.keyword_cascade,
    $.keyword_restrict,
  ),

  // <alter type statement> ::= ALTER TYPE <type name> { ADD ATTRIBUTE <attribute definition> |
  //                                                    DROP ATTRIBUTE <attribute name> RESTRICT }
  alter_type: $ => seq(
    $.keyword_alter,
    $.keyword_type,
    $.object_reference,
    choice(
      seq($.keyword_add, $.keyword_attribute, $.identifier, $._type),
      seq($.keyword_drop, $.keyword_attribute, $.identifier, $.keyword_restrict),
    ),
  ),

  // <alter sequence generator statement> ::= ALTER SEQUENCE <name> <alter sequence generator option> ...
  alter_sequence: $ => seq(
    $.keyword_alter,
    $.keyword_sequence,
    $.object_reference,
    repeat1(
      choice(
        seq($.keyword_restart, optional(seq($.keyword_with, field('restart', alias($._integer, $.literal))))),
        seq($.keyword_increment, $.keyword_by, $.literal),
        seq($.keyword_minvalue, choice($.literal, seq($.keyword_no, $.keyword_minvalue))),
        seq($.keyword_maxvalue, choice($.literal, seq($.keyword_no, $.keyword_maxvalue))),
        seq(optional($.keyword_no), $.keyword_cycle),
      ),
    ),
  ),

};
