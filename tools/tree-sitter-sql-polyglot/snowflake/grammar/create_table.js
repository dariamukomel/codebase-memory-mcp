import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// CREATE TABLE as Snowflake documents it:
// https://docs.snowflake.com/en/sql-reference/sql/create-table
// The statement is a column list followed by table clauses that may appear in any order, so the
// clauses are one repeated choice instead of a fixed sequence. Source forms (CLONE, LIKE,
// USING TEMPLATE) sit in the same choice; a CTAS query (AS query) is always last.
export default {

  create_table: $ => prec.left(
    seq(
      $.keyword_create,
      optional($._or_replace_or_alter),
      optional($._snowflake_table_kind),
      optional(seq($.keyword_read, $.keyword_only)),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      optional($.column_definitions),
      repeat($._snowflake_table_clause),
      optional(seq($.keyword_as, $.create_query)),
    ),
  ),

  // [LOCAL | GLOBAL] {TEMP | TEMPORARY} | VOLATILE | TRANSIENT
  _snowflake_table_kind: $ => choice(
    seq(optional(choice($.keyword_local, $.keyword_global, $.keyword_scoped)), $._temporary),
    $.keyword_volatile,
    $.keyword_transient,
    seq(optional($.keyword_transient), choice($.keyword_hybrid, $.keyword_iceberg)),
  ),

  // INDEX name (col, ...) [INCLUDE (col, ...)]  (hybrid tables)
  index_definition: $ => seq(
    $.keyword_index,
    $.identifier,
    paren_list($.identifier, true),
    optional(seq($.keyword_include, paren_list($.identifier, true))),
  ),

  // PARTITION BY (<column | transform>, ...)  (Iceberg tables)
  iceberg_partition_clause: $ => seq($.keyword_partition, $.keyword_by, paren_list($._expression, true)),

  _snowflake_table_clause: $ => choice(
    $.clone_clause,
    $.backup_set_clause,
    seq($.keyword_like, $.object_reference),
    // FROM ARCHIVE OF src [AS alias] [WHERE cond]
    prec.right(seq($.keyword_from, $.keyword_archive, $.keyword_of, $.object_reference, optional(seq($.keyword_as, $.identifier)), optional($.where))),
    seq($.keyword_using, $.keyword_template, wrapped_in_parenthesis($.create_query)),
    $.cluster_by_clause,
    $.iceberg_partition_clause,
    seq($.keyword_comment, '=', alias($._literal_string, $.literal)),
    seq($.keyword_copy, choice($.keyword_grants, $.keyword_tags)),
    $.tag_clause,
    $.row_access_policy_clause,
    $.aggregation_policy_clause,
    $.join_policy_clause,
    $.storage_lifecycle_policy_clause,
    $.contact_clause,
    $.snowflake_property,
  ),

  cluster_by_clause: $ => seq(
    $.keyword_cluster,
    $.keyword_by,
    paren_list($._expression, true),
  ),

  // [WITH] TAG (name = 'value', ...)
  tag_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_tag,
    paren_list(seq($.object_reference, '=', $.literal), true),
  ),

  // [WITH] ROW ACCESS POLICY policy ON (col, ...)
  row_access_policy_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_row,
    $.keyword_access,
    $.keyword_policy,
    $.object_reference,
    $.keyword_on,
    paren_list($.identifier, true),
  ),

  // [WITH] AGGREGATION POLICY policy [ENTITY KEY (col, ...)]
  aggregation_policy_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_aggregation,
    $.keyword_policy,
    $.object_reference,
    optional(seq($.keyword_entity, $.keyword_key, paren_list($.identifier, true))),
  ),

  // JOIN POLICY policy [ALLOWED JOIN KEYS (col, ...)]
  join_policy_clause: $ => seq(
    $.keyword_join,
    $.keyword_policy,
    $.object_reference,
    optional(seq($.keyword_allowed, $.keyword_join, $.keyword_keys, paren_list($.identifier, true))),
  ),

  // WITH STORAGE LIFECYCLE POLICY policy ON (col, ...)
  storage_lifecycle_policy_clause: $ => seq(
    $.keyword_with,
    $.keyword_storage,
    $.keyword_lifecycle,
    $.keyword_policy,
    $.object_reference,
    $.keyword_on,
    paren_list($.identifier, true),
  ),

  // [WITH] CONTACT (purpose = contact, ...)
  contact_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_contact,
    paren_list(seq($.identifier, '=', $.identifier), true),
  ),

  // ( column_definition | out_of_line_constraint, ... ). CTAS allows bare column names.
  column_definitions: $ => seq(
    '(',
    comma_list(choice($.column_definition, $.table_constraint, $.index_definition, alias($._column, $.column)), true),
    ')',
  ),

  // Keywords that Snowflake does not reserve are valid column names: CREATE TABLE t (index INT, primary INT).
  _column: $ => choice(
    $.identifier,
    alias($._literal_string, $.literal),
    alias(choice($.keyword_primary, $.keyword_foreign, $.keyword_index, $.keyword_identifier), $.identifier),
  ),

  column_definition: $ => prec.left(seq(
    field('name', $._column),
    field('type', $._type),
    repeat($._column_constraint),
  )),

  _column_constraint: $ => prec.left(choice(
    $._not_null,
    $.keyword_null,
    seq($.keyword_collate, alias($._literal_string, $.literal)),
    seq($.keyword_default, $._expression),
    $.identity_clause,
    seq($.keyword_comment, alias($._literal_string, $.literal)),
    seq(optional($.keyword_generated), optional($.keyword_always), $.keyword_as, wrapped_in_parenthesis($._expression), optional($.keyword_virtual)),
    $.tag_clause,
    $.masking_policy_clause,
    $.projection_policy_clause,
    $.inline_constraint,
  )),

  // {AUTOINCREMENT | IDENTITY} [(start, step) | START n INCREMENT n] [ORDER | NOORDER]
  identity_clause: $ => seq(
    choice($.keyword_autoincrement, $.keyword_identity),
    optional(choice(
      paren_list($.literal, true),
      seq($.keyword_start, optional('='), $.literal, $.keyword_increment, optional('='), $.literal),
    )),
    optional(choice($.keyword_order, $.keyword_noorder)),
  ),

  // [WITH] MASKING POLICY policy [USING (col, ...)]
  masking_policy_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_masking,
    $.keyword_policy,
    $.object_reference,
    optional(seq($.keyword_using, paren_list($._expression, true))),
  ),

  // [WITH] PROJECTION POLICY policy
  projection_policy_clause: $ => seq(
    optional($.keyword_with),
    $.keyword_projection,
    $.keyword_policy,
    $.object_reference,
  ),

  // [CONSTRAINT name] {UNIQUE | PRIMARY KEY | CHECK (expr) | [FOREIGN KEY] REFERENCES t [(col)]} [properties]
  inline_constraint: $ => seq(
    optional(seq($.keyword_constraint, field('name', $.identifier))),
    choice(
      seq($.keyword_check, wrapped_in_parenthesis($._expression)),
      $.keyword_unique,
      seq($.keyword_primary, $.keyword_key),
      seq(
        optional(seq($.keyword_foreign, $.keyword_key)),
        $.keyword_references,
        $.object_reference,
        optional(paren_list($.identifier, true)),
      ),
    ),
    repeat($._constraint_property),
  ),

  // Out-of-line constraint, inside the column list.
  table_constraint: $ => seq(
    optional(seq($.keyword_constraint, field('name', $.identifier))),
    choice(
      seq(choice($.keyword_unique, seq($.keyword_primary, $.keyword_key)), paren_list($.identifier, true)),
      seq(
        $.keyword_foreign,
        $.keyword_key,
        paren_list($.identifier, true),
        $.keyword_references,
        $.object_reference,
        optional(paren_list($.identifier, true)),
      ),
      seq($.keyword_check, wrapped_in_parenthesis($._expression)),
    ),
    repeat($._constraint_property),
    optional(seq($.keyword_comment, alias($._literal_string, $.literal))),
  ),

  _constraint_property: $ => choice(
    seq($.keyword_match, choice($.keyword_full, $.keyword_simple, $.keyword_partial)),
    seq($.keyword_on, choice($.keyword_update, $.keyword_delete), choice(
      $.keyword_cascade,
      $.keyword_restrict,
      seq($.keyword_set, $.keyword_null),
      seq($.keyword_set, $.keyword_default),
      seq($.keyword_no, $.keyword_action),
    )),
    seq(optional($.keyword_not), $.keyword_enforced),
    seq(optional($.keyword_not), $.keyword_deferrable),
    seq($.keyword_initially, choice($.keyword_deferred, $.keyword_immediate)),
    $.keyword_enable,
    $.keyword_disable,
    $.keyword_validate,
    $.keyword_novalidate,
    $.keyword_rely,
    $.keyword_norely,
  ),

};
