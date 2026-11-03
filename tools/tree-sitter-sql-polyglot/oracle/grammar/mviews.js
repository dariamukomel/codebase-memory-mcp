import { paren_list } from '../../grammar/helpers.js';

// Oracle's materialized-view family (view, view log, zonemap), the remaining
// DATABASE LINK statements, and the Oracle-only tails on DROP TABLE/TYPE,
// ALTER INDEX and ALTER VIEW. Transcribed from the SQL Language Reference.
export default {

  // ── Materialized views ──────────────────────────────────────────────────

  // BUILD {IMMEDIATE | DEFERRED}
  _mv_build_clause: $ => seq(
    $.keyword_build,
    choice($.keyword_immediate, $.keyword_deferred),
  ),

  // REFRESH [FAST | COMPLETE | FORCE] [ON {DEMAND | COMMIT}] [START WITH …]
  //   [NEXT …] [WITH {PRIMARY KEY | ROWID}]
  // NEVER REFRESH
  mv_refresh_clause: $ => prec.right(choice(
    seq($.keyword_never, $.keyword_refresh),
    seq(
      $.keyword_refresh,
      repeat1(choice(
        $.keyword_fast,
        $.keyword_complete,
        $.keyword_force,
        seq($.keyword_on, choice($.keyword_demand, $.keyword_commit)),
        seq($.keyword_start, $.keyword_with, $._expression),
        seq($.keyword_next, $._expression),
        seq($.keyword_with, choice(seq($.keyword_primary, $.keyword_key), $.keyword_rowid)),
        seq(choice($.keyword_using, $.keyword_default), $.keyword_master, $.keyword_rollback, $.keyword_segment),
      )),
    ),
  )),

  // {ENABLE | DISABLE} QUERY REWRITE
  _mv_query_rewrite: $ => seq(
    choice($.keyword_enable, $.keyword_disable),
    $.keyword_query,
    $.keyword_rewrite,
  ),

  // CREATE MATERIALIZED VIEW [IF NOT EXISTS] mv
  //   [ON PREBUILT TABLE] [BUILD …] [REFRESH …] [{ENABLE|DISABLE} QUERY REWRITE]
  //   AS query
  create_materialized_view: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_on, $.keyword_prebuilt, $.keyword_table)),
    repeat(choice(
      $._mv_build_clause,
      $.mv_refresh_clause,
      $._mv_query_rewrite,
      $._oracle_physical_attribute,
    )),
    $.keyword_as,
    $.create_query,
    optional(seq($.keyword_with, optional($.keyword_no), $.keyword_data)),
  )),

  // ALTER MATERIALIZED VIEW mv {REFRESH … | {ENABLE|DISABLE} QUERY REWRITE
  //   | COMPILE | CONSIDER FRESH | RENAME TO … | …}
  alter_materialized_view: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    repeat1(choice(
      $.rename_object,
      $.set_schema,
      $.change_ownership,
      $.mv_refresh_clause,
      $._mv_query_rewrite,
      $.keyword_compile,
      seq($.keyword_consider, $.keyword_fresh),
      $._oracle_physical_attribute,
    )),
  )),

  // CREATE MATERIALIZED VIEW LOG ON t [physical attributes]
  //   [WITH {PRIMARY KEY | ROWID | SEQUENCE | (col, …)} [, …]]
  //   [{INCLUDING | EXCLUDING} NEW VALUES]
  create_materialized_view_log: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_materialized,
    $.keyword_view,
    $.keyword_log,
    $.keyword_on,
    field('table', $.object_reference),
    repeat($._oracle_physical_attribute),
    optional(seq($.keyword_with, $._mv_log_value_list)),
    optional($._mv_log_new_values),
  )),

  // ALTER MATERIALIZED VIEW LOG [FORCE] ON t {ADD … | …}
  alter_materialized_view_log: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_view,
    $.keyword_log,
    optional($.keyword_force),
    $.keyword_on,
    field('table', $.object_reference),
    repeat1(choice(
      seq($.keyword_add, $._mv_log_value_list),
      $._mv_log_new_values,
      $._oracle_physical_attribute,
    )),
  )),

  // DROP MATERIALIZED VIEW LOG ON t
  drop_materialized_view_log: $ => seq(
    $.keyword_drop,
    $.keyword_materialized,
    $.keyword_view,
    $.keyword_log,
    $.keyword_on,
    field('table', $.object_reference),
  ),

  _mv_log_value_list: $ => seq(
    $._mv_log_value,
    repeat(seq(',', $._mv_log_value)),
  ),

  _mv_log_value: $ => choice(
    seq($.keyword_primary, $.keyword_key),
    $.keyword_rowid,
    $.keyword_sequence,
    paren_list($.identifier, true),
  ),

  _mv_log_new_values: $ => seq(
    choice($.keyword_including, $.keyword_excluding),
    $.keyword_new,
    $.keyword_values,
  ),

  // CREATE MATERIALIZED ZONEMAP z ON t (col, …)
  create_materialized_zonemap: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_materialized,
    $.keyword_zonemap,
    $.object_reference,
    repeat(choice(
      $._mv_query_rewrite,
      $.keyword_pruning,
      $._oracle_physical_attribute,
    )),
    choice(
      seq(
        $.keyword_on,
        field('table', $.object_reference),
        paren_list($._expression, true),
      ),
      seq($.keyword_as, $.create_query),
    ),
  )),

  // ALTER MATERIALIZED ZONEMAP z {REBUILD | COMPILE | …}
  alter_materialized_zonemap: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_zonemap,
    $.object_reference,
    repeat1(choice(
      $.keyword_rebuild,
      $.keyword_compile,
      $.keyword_pruning,
      $._mv_query_rewrite,
      $._oracle_physical_attribute,
    )),
  )),

  // DROP MATERIALIZED ZONEMAP z
  drop_materialized_zonemap: $ => seq(
    $.keyword_drop,
    $.keyword_materialized,
    $.keyword_zonemap,
    $.object_reference,
  ),

  // Storage/physical attributes shared by the statements above. Oracle spells
  // these across a dozen syntax blocks; the common ones are accepted as a flat
  // repeat rather than in their documented order.
  _oracle_physical_attribute: $ => choice(
    seq($.keyword_tablespace, $.identifier),
    seq($.keyword_pctfree, $.literal),
    seq($.keyword_pctused, $.literal),
    seq($.keyword_initrans, $.literal),
    seq($.keyword_parallel, optional($.literal)),
    $.keyword_noparallel,
    $.keyword_cache,
    $.keyword_nocache,
    choice($.keyword_logging, $.keyword_nologging),
    seq($.keyword_storage, paren_list($._oracle_storage_option, false)),
  ),

  _oracle_storage_option: $ => seq(
    field('name', $.identifier),
    field('value', choice($.literal, $.identifier)),
  ),

  // ── DATABASE LINK ───────────────────────────────────────────────────────

  // ALTER [SHARED] [PUBLIC] DATABASE LINK name
  //   CONNECT TO user IDENTIFIED BY pw
  //   [AUTHENTICATED BY user IDENTIFIED BY pw]
  alter_database_link_statement: $ => prec.right(seq(
    $.keyword_alter,
    optional($.keyword_shared),
    optional($.keyword_public),
    $.keyword_database,
    $.keyword_link,
    $.object_reference,
    repeat1(choice(
      seq(
        $.keyword_connect,
        $.keyword_to,
        $.identifier,
        $.keyword_identified,
        $.keyword_by,
        $._expression,
      ),
      seq(
        $.keyword_authenticated,
        $.keyword_by,
        $.identifier,
        $.keyword_identified,
        $.keyword_by,
        $._expression,
      ),
    )),
  )),

  // DROP [PUBLIC] DATABASE LINK name
  drop_database_link_statement: $ => seq(
    $.keyword_drop,
    optional($.keyword_public),
    $.keyword_database,
    $.keyword_link,
    $.object_reference,
  ),

  // ── Oracle tails on inherited statements ────────────────────────────────

  // DROP TABLE t [CASCADE CONSTRAINTS] [PURGE]
  drop_table: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_table,
    optional($._if_exists),
    field("target", $.object_reference),
    optional(seq($.keyword_cascade, $.keyword_constraints)),
    optional($.keyword_purge),
  )),

  // DROP TYPE [BODY] t [FORCE | VALIDATE]
  drop_type: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_type,
    optional($.keyword_body),
    optional($._if_exists),
    $.object_reference,
    optional(choice($.keyword_force, $.keyword_validate)),
  )),

  // ALTER VIEW v {COMPILE | READ ONLY | READ WRITE | ADD/MODIFY/DROP CONSTRAINT}
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
      $.keyword_compile,
      seq($.keyword_read, choice($.keyword_only, $.keyword_write)),
      $.add_constraint,
      $.drop_constraint,
      seq($.keyword_modify, $.keyword_constraint, field('name', $.identifier)),
    ),
  ),

  // ALTER INDEX i {REBUILD [...] | UNUSABLE | COALESCE | RENAME TO …
  //   | MONITORING USAGE | physical attributes}
  alter_index: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_index,
    optional($._if_exists),
    $.object_reference,
    repeat1(choice(
      $.rename_object,
      // The physical attributes that may follow REBUILD are collected by the
      // outer repeat1, not nested here; nesting them makes the two repeats
      // ambiguous for a shared attribute.
      $.keyword_rebuild,
      $.keyword_reverse,
      $.keyword_noreverse,
      $.keyword_online,
      $.keyword_compute,
      $.keyword_unusable,
      $.keyword_coalesce,
      $.keyword_compile,
      seq(optional($.keyword_no), $.keyword_monitoring, $.keyword_usage),
      seq($.keyword_reset, paren_list($.identifier)),
      seq($.keyword_set, $.keyword_tablespace, $.identifier),
      $._oracle_physical_attribute,
    )),
  )),

};
