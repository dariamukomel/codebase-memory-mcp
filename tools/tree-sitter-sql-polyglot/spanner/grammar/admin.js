import { comma_list, paren_list } from '../../grammar/helpers.js';

// Spanner DDL that had no rule at all. Every shape is transcribed from its
// section in
// https://cloud.google.com/spanner/docs/reference/standard-sql/data-definition-language
export default {

  // CREATE LOCALITY GROUP g [OPTIONS (…)]
  // ALTER  LOCALITY GROUP g [SET OPTIONS (…)]
  // DROP   LOCALITY GROUP g
  // CREATE PLACEMENT p [OPTIONS (…)]  |  DROP PLACEMENT p
  locality_group_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter, $.keyword_drop),
    choice(
      seq($.keyword_locality, $.keyword_group),
      $.keyword_placement,
    ),
    field('name', $.identifier),
    optional(seq(optional($.keyword_set), $.options_clause)),
  )),

  // CREATE PROTO BUNDLE (type [, …])
  // ALTER  PROTO BUNDLE [INSERT (…)] [UPDATE (…)] [DELETE (…)]
  // DROP   PROTO BUNDLE
  proto_bundle_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter, $.keyword_drop),
    $.keyword_proto,
    $.keyword_bundle,
    optional(paren_list($.object_reference, true)),
    repeat(seq(
      choice($.keyword_insert, $.keyword_update, $.keyword_delete),
      paren_list($.object_reference, true),
    )),
  )),

  // CREATE SEARCH INDEX i ON t (cols) [STORING (…)] [PARTITION BY …]
  //   [ORDER BY …] [WHERE …] [, INTERLEAVE IN …] [OPTIONS (…)]
  create_search_index: $ => prec.right(seq(
    $.keyword_create,
    choice($.keyword_search, $.keyword_vector),
    $.keyword_index,
    optional($._if_not_exists),
    field('name', $.identifier),
    $.keyword_on,
    field('table', $.object_reference),
    paren_list($.identifier, true),
    optional(seq($.keyword_storing, paren_list($.identifier, true))),
    optional($.bq_partition_by),
    optional($.order_by),
    optional($.where),
    optional($.interleave_clause),
    optional($.options_clause),
  )),

  // ALTER {SEARCH | VECTOR} INDEX i {ADD | DROP} [STORED] COLUMN c
  //   | SET OPTIONS (…)
  // ALTER INDEX i {ADD | DROP} STORED COLUMN c [OPTIONS (…)]
  alter_index_columns: $ => prec.right(seq(
    $.keyword_alter,
    optional(choice($.keyword_search, $.keyword_vector)),
    $.keyword_index,
    field('name', $.identifier),
    choice(
      seq(
        choice($.keyword_add, $.keyword_drop),
        optional($.keyword_stored),
        $.keyword_column,
        field('column', $.identifier),
      ),
      seq($.keyword_set, $.options_clause),
    ),
    optional($.options_clause),
  )),

  // DROP {SEARCH | VECTOR} INDEX [IF EXISTS] i
  // A deliberate override of the BigQuery rule of the same name: BigQuery
  // spells this `DROP SEARCH INDEX i ON table`, Spanner has no ON clause.
  drop_search_index: $ => seq(
    $.keyword_drop,
    choice($.keyword_search, $.keyword_vector),
    $.keyword_index,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  // ALTER CHANGE STREAM s { SET FOR … | DROP FOR ALL | SET OPTIONS (…) }
  alter_change_stream: $ => seq(
    $.keyword_alter,
    $.keyword_change,
    $.keyword_stream,
    field('name', $.identifier),
    choice(
      seq($.keyword_set, $.keyword_for, choice($.keyword_all, $.change_stream_target)),
      seq($.keyword_drop, $.keyword_for, $.keyword_all),
      seq($.keyword_set, $.options_clause),
    ),
  ),

  // DROP CHANGE STREAM [IF EXISTS] s
  drop_change_stream: $ => seq(
    $.keyword_drop,
    $.keyword_change,
    $.keyword_stream,
    optional($._if_exists),
    field('name', $.identifier),
  ),

  // ALTER STATISTICS package SET OPTIONS (…)
  alter_statistics: $ => seq(
    $.keyword_alter,
    $.keyword_statistics,
    field('name', $.identifier),
    $.keyword_set,
    $.options_clause,
  ),

  // ANALYZE
  analyze_statement: $ => $.keyword_analyze,

  // { CREATE MODEL | CREATE OR REPLACE MODEL | CREATE MODEL IF NOT EXISTS } m
  //   [INPUT (cols) OUTPUT (cols)] REMOTE [OPTIONS (…)]
  // Overrides the inherited BigQuery create_model, which ends in `AS query`.
  // Spanner models are remote endpoints, so the two shapes cannot coexist:
  // both start `CREATE [OR REPLACE] MODEL name` and _create_statement can
  // only reach one of them.
  create_model: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_model,
    optional($._if_not_exists),
    field('name', $.object_reference),
    optional(seq(
      $.keyword_input,
      $.column_definitions,
      $.keyword_output,
      $.column_definitions,
    )),
    $.keyword_remote,
    optional($.options_clause),
  )),

  // ALTER MODEL [IF EXISTS] m SET OPTIONS (…)  |  DROP MODEL [IF EXISTS] m
  model_statement: $ => prec.right(seq(
    choice($.keyword_alter, $.keyword_drop),
    $.keyword_model,
    optional($._if_exists),
    field('name', $.object_reference),
    optional(seq($.keyword_set, $.options_clause)),
  )),

};
