import { paren_list } from '../../grammar/helpers.js';

// The BigQuery ALTER surface. Every ALTER statement in GoogleSQL DDL takes a
// SET OPTIONS(…) action that the ANSI base has no notion of, and ALTER TABLE
// adds primary/foreign key and default-collation actions. Transcribed from
// https://cloud.google.com/bigquery/docs/reference/standard-sql/data-definition-language
export default {

  // ALTER VIEW [IF EXISTS] v SET OPTIONS(…), plus the inherited base actions.
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
      seq($.keyword_set, $.options_clause),
    ),
  ),

  // ALTER MATERIALIZED VIEW [IF EXISTS] mv SET OPTIONS(…)
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
      seq($.keyword_set, $.options_clause),
    ),
  ),

  // ALTER SCHEMA [IF EXISTS] s {SET OPTIONS(…) | SET DEFAULT COLLATE '…'}
  // ADD/DROP REPLICA is a separate rule (alter_schema_replica) because its
  // name position differs.
  alter_schema: $ => seq(
    $.keyword_alter,
    $.keyword_schema,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq(choice($.keyword_rename, $.keyword_owner), $.keyword_to, $.identifier),
      seq($.keyword_set, $.options_clause),
      seq($.keyword_set, $._bq_default_collate),
    ),
  ),

  // CREATE SCHEMA [IF NOT EXISTS] s [DEFAULT COLLATE '…'] [OPTIONS(…)]
  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    optional($._if_not_exists),
    $.object_reference,
    optional($._bq_default_collate),
    optional($.options_clause),
  )),

  _bq_default_collate: $ => seq(
    $.keyword_default,
    $.keyword_collate,
    field('collation', alias($._literal_string, $.literal)),
  ),

  // base _alter_specifications plus the BigQuery-only table actions.
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
    // ALTER TABLE t SET OPTIONS(…) | SET DEFAULT COLLATE '…'
    seq($.keyword_set, $.options_clause),
    seq($.keyword_set, $._bq_default_collate),
    // ALTER TABLE t DROP PRIMARY KEY [IF EXISTS]
    seq(
      $.keyword_drop,
      $.keyword_primary,
      $.keyword_key,
      optional($._if_exists),
    ),
  ),

  // base add_constraint plus BigQuery's unnamed form and the mandatory
  // enforcement tail:
  //   ADD PRIMARY KEY (cols) NOT ENFORCED
  //   ADD [CONSTRAINT [IF NOT EXISTS] c] FOREIGN KEY (cols) REFERENCES … NOT ENFORCED
  // Whether the word after ADD is a constraint name or the start of PRIMARY
  // KEY is not decidable with one token of lookahead, so bigquery's conflicts
  // list carries [$.add_constraint].
  add_constraint: $ => seq(
    $.keyword_add,
    choice(
      seq(
        optional($.keyword_constraint),
        optional($._if_not_exists),
        field('name', $.identifier),
        $.constraint,
      ),
      // The unnamed forms only; $.constraint as a whole would also match
      // CONSTRAINT name …, which the named alternative above already covers.
      choice(
        $._primary_key_constraint,
        $._key_constraint,
        $._check_constraint,
      ),
    ),
    optional($._bq_enforcement),
  ),

  _bq_enforcement: $ => seq(optional($.keyword_not), $.keyword_enforced),

  // base alter_column plus SET OPTIONS(…) and SET DEFAULT.
  alter_column: $ => seq(
    $.keyword_alter,
    $.keyword_column,
    optional($._if_exists),
    field('name', $.identifier),
    choice(
      seq($.keyword_set, $.options_clause),
      seq($.keyword_set, $.keyword_data, $.keyword_type, field('type', $._type)),
      seq($.keyword_set, $.keyword_default, $._expression),
      seq($.keyword_drop, $.keyword_default),
      seq($.keyword_drop, $.keyword_not, $.keyword_null),
    ),
  ),

  // DROP ALL ROW ACCESS POLICIES ON table
  drop_all_row_access_policies: $ => seq(
    $.keyword_drop,
    $.keyword_all,
    $.keyword_row,
    $.keyword_access,
    $.keyword_policies,
    $.keyword_on,
    field('table', $.object_reference),
  ),

};
