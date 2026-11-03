// ISO 9075 DROP statements. Each takes a required <drop behavior> (CASCADE | RESTRICT), except DROP ROLE.
// IF EXISTS and DROP INDEX / MATERIALIZED VIEW / DATABASE / USER / GROUP are vendor syntax and live in
// each dialect's grammar/legacy_statements.js.
export default {

  _drop_statement: $ => seq(
    choice(
      $.drop_table,
      $.drop_view,
      $.drop_type,
      $.drop_schema,
      $.drop_role,
      $.drop_sequence,
      $.drop_function,
      $.drop_procedure,
    ),
  ),

  drop_table: $ => seq($.keyword_drop, $.keyword_table, field('target', $.object_reference), $._drop_behavior),

  drop_view: $ => seq($.keyword_drop, $.keyword_view, field('target', $.object_reference), $._drop_behavior),

  drop_schema: $ => seq($.keyword_drop, $.keyword_schema, $.identifier, $._drop_behavior),

  drop_role: $ => seq($.keyword_drop, $.keyword_role, $.identifier),

  drop_type: $ => seq($.keyword_drop, $.keyword_type, field('target', $.object_reference), $._drop_behavior),

  drop_sequence: $ => seq($.keyword_drop, $.keyword_sequence, field('target', $.object_reference), $._drop_behavior),

  drop_function: $ => seq($.keyword_drop, $.keyword_function, field('target', $.object_reference), $._drop_behavior),

  drop_procedure: $ => seq($.keyword_drop, $.keyword_procedure, field('target', $.object_reference), $._drop_behavior),

};
