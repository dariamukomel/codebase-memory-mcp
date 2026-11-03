import { comma_list, paren_list } from '../../grammar/helpers.js';

// ALTER for the Snowflake objects that share one action vocabulary (rename, swap, SET / UNSET,
// SUSPEND / RESUME, tags, policies). Each object takes a subset of the actions; the union is
// accepted per object kind and anchored by the object keyword.
// https://docs.snowflake.com/en/sql-reference/sql/alter-view (and the sibling ALTER pages)
export default {

  // Each object kind accepts only the actions its ALTER page documents. Property lists
  // (SET name = value ...) stay open-ended because Snowflake adds properties every release.
  alter_view: $ => seq(
    $.keyword_alter, $.keyword_view, optional($._if_exists), $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_set, choice(
        $.keyword_secure,
        $._set_tag,
        $._set_contact,
        $._join_policy,
        $._aggregation_policy,
        $._set_properties,
      )),
      seq($.keyword_unset, choice($.keyword_secure, $._unset_tag, seq($.keyword_join, $.keyword_policy), $._unset_properties)),
      seq($.keyword_add, $.row_access_policy_clause),
      seq($.keyword_drop, $._drop_row_access_policy, optional(seq(',', $.keyword_add, $.row_access_policy_clause))),
      seq($.keyword_drop, $.keyword_all, $.keyword_row, $.keyword_access, $.keyword_policies),
      seq(choice($.keyword_alter, $.keyword_modify), optional($.keyword_column), $.identifier, $._snowflake_column_action),
      seq($.keyword_add, $.keyword_data, $.keyword_metric, $.keyword_function, $.object_reference, $.keyword_on, paren_list($.identifier, true)),
    ),
  ),

  alter_materialized_view: $ => seq(
    $.keyword_alter, $.keyword_materialized, $.keyword_view, optional($._if_exists), $.object_reference,
    choice(
      $.rename_object,
      $._cluster_by,
      seq($.keyword_drop, $.keyword_clustering, $.keyword_key),
      seq(choice($.keyword_suspend, $.keyword_resume), optional($.keyword_recluster)),
      seq($.keyword_set, choice($.keyword_secure, $._set_contact, $._set_properties)),
      seq($.keyword_unset, choice($.keyword_secure, $._unset_properties)),
    ),
  ),

  alter_task: $ => seq(
    $.keyword_alter, $.keyword_task, optional($._if_exists), $.object_reference,
    choice(
      $.keyword_resume,
      $.keyword_suspend,
      seq($.keyword_add, $.keyword_after, comma_list($.object_reference, true)),
      seq($.keyword_remove, $.keyword_after, comma_list($.object_reference, true)),
      seq($.keyword_modify, $.keyword_as, $._dml_read),
      seq($.keyword_modify, $.keyword_when, $._expression),
      seq($.keyword_remove, $.keyword_when),
      seq($.keyword_set, choice(
        seq($.keyword_execute, $.keyword_as, $.keyword_user, $.identifier),
        $._set_tag,
        $._set_contact,
        $._set_properties,
      )),
      seq($.keyword_unset, choice($._unset_tag, repeat1(seq($._unset_name, optional(','))))),
    ),
  ),

  alter_dynamic_table: $ => seq(
    $.keyword_alter, $.keyword_dynamic, $.keyword_table, optional($._if_exists), $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_swap, $.keyword_with, $.object_reference),
      seq($.keyword_suspend, optional(seq($.keyword_search, $.keyword_optimization, $.keyword_on, $.identifier, paren_list($.identifier, true)))),
      $.keyword_resume,
      seq($.keyword_refresh, optional(seq($.keyword_copy, $.keyword_session))),
      $._cluster_by,
      seq($.keyword_drop, $.keyword_clustering, $.keyword_key),
      seq($.keyword_alter, optional($.keyword_column), $.identifier, $._snowflake_column_action),
      seq($.keyword_add, $.keyword_storage, $.keyword_lifecycle, $.keyword_policy, $.object_reference, $.keyword_on, paren_list($.identifier, true)),
      seq($.keyword_set, choice(seq($.keyword_frozen, $.keyword_where, '(', $._expression, ')'), $._set_tag, $._set_properties)),
      seq($.keyword_unset, choice(seq($.keyword_frozen, optional($.keyword_where)), $._unset_tag, $._unset_properties)),
    ),
  ),

  alter_alert: $ => seq(
    $.keyword_alter, $.keyword_alert, optional($._if_exists), $.object_reference,
    choice(
      $.keyword_resume,
      $.keyword_suspend,
      seq($.keyword_modify, $.keyword_action, $.task_body),
      seq($.keyword_modify, $.keyword_condition, $.keyword_exists, '(', $._dml_read, ')'),
      seq($.keyword_from, $.keyword_template, $.object_reference, $.keyword_set, $._set_properties_body),
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_warehouse: $ => seq(
    $.keyword_alter, $.keyword_warehouse, optional($._if_exists), $.object_reference,
    choice(
      $.rename_object,
      $.keyword_suspend,
      seq($.keyword_resume, optional(seq($.keyword_if, $.keyword_suspended))),
      seq($.keyword_abort, $.keyword_all, $.keyword_queries),
      seq($.keyword_add, $.keyword_tables, paren_list($.object_reference, true)),
      seq($.keyword_drop, $.keyword_tables, paren_list($.object_reference, true)),
      $.keyword_enable,
      $.keyword_disable,
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  // ALTER STREAM / PIPE / ROLE: only SET / UNSET (plus REFRESH for pipes and RENAME for roles).
  alter_stream: $ => seq(
    $.keyword_alter, $.keyword_stream, optional($._if_exists), $.object_reference,
    choice(
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_pipe: $ => seq(
    $.keyword_alter, $.keyword_pipe, optional($._if_exists), $.object_reference,
    choice(
      seq($.keyword_refresh, repeat($.snowflake_property)),
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_role: $ => seq(
    $.keyword_alter, $.keyword_role, optional($._if_exists), $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_user: $ => seq(
    $.keyword_alter, $.keyword_user, optional($._if_exists), optional($.object_reference),
    choice(
      $.rename_object,
      $._key_pair_action,
      $._pat_action,
      seq($.keyword_abort, $.keyword_all, $.keyword_queries),
      seq($.keyword_reset, $.keyword_password),
      seq($.keyword_enroll, $.keyword_mfa),
      seq($.keyword_add, $.keyword_mfa, $.keyword_method, $.identifier, repeat($.snowflake_property)),
      seq($.keyword_modify, $.keyword_mfa, $.keyword_method, $.identifier, $.keyword_set, $._set_properties_body),
      seq($.keyword_remove, $.keyword_mfa, $.keyword_method, $.identifier),
      seq($.keyword_add, $.keyword_delegated, $.keyword_authorization, $.keyword_of, $.keyword_role, $.identifier, $.keyword_to, $.keyword_security, $.keyword_integration, $.identifier),
      seq($.keyword_remove, $.keyword_delegated, choice(
        seq($.keyword_authorization, $.keyword_of, $.keyword_role, $.identifier),
        $.keyword_authorizations,
        seq($.keyword_authorizations, $.keyword_of, $.keyword_any, $.keyword_role),
      ), $.keyword_from, $.keyword_security, $.keyword_integration, $.identifier),
      seq($.keyword_set, choice(
        $._set_tag,
        seq($.keyword_authentication, $.keyword_policy, $.object_reference, optional($.keyword_force)),
        $._set_properties,
      )),
      seq($.keyword_unset, choice($._unset_tag, seq($.keyword_session, $.keyword_policy), $._unset_properties)),
    ),
  ),

  // --- shared clauses -------------------------------------------------------------------------

  _set_tag: $ => seq($.keyword_tag, comma_list($.tag_assignment, true)),
  _unset_tag: $ => seq($.keyword_tag, comma_list($.object_reference, true)),
  _set_contact: $ => seq($.keyword_contact, comma_list(seq($.identifier, '=', $.identifier), true)),
  _join_policy: $ => seq($.keyword_join, $.keyword_policy, $.object_reference),
  _aggregation_policy: $ => seq($.keyword_aggregation, $.keyword_policy, $.object_reference, optional(seq($.keyword_entity, $.keyword_key, paren_list($.identifier, true))), optional($.keyword_force)),
  _cluster_by: $ => seq($.keyword_cluster, $.keyword_by, paren_list($._expression, true)),
  _drop_row_access_policy: $ => seq($.keyword_row, $.keyword_access, $.keyword_policy, $.object_reference),

  // name = value [[,] name = value ...]
  _set_properties: $ => $._set_properties_body,
  _set_properties_body: $ => seq($.snowflake_property, repeat(seq(optional(','), $.snowflake_property))),

  // UNSET name [, name ...]
  _unset_properties: $ => prec.right(repeat1(seq($._unset_name, optional(',')))),
  _unset_name: $ => choice($.identifier, $.keyword_warehouse, seq($.keyword_dcm, $.keyword_project)),

  alter_routine: $ => seq(
    $.keyword_alter,
    choice($.keyword_function, $.keyword_procedure),
    optional($._if_exists),
    $.object_reference,
    paren_list(choice($._type, seq($.keyword_table, paren_list($._type, false))), false),
    choice(
      $.rename_object,
      seq($.keyword_set, choice(
        $.keyword_secure,
        seq($.keyword_tag, comma_list($.tag_assignment, true)),
        repeat1($.snowflake_property),
      )),
      seq($.keyword_unset, choice(
        $.keyword_secure,
        seq($.keyword_tag, comma_list($.object_reference, true)),
        comma_list($.identifier, true),
      )),
      seq($.keyword_execute, $.keyword_as, choice(
        $.keyword_owner,
        $.keyword_caller,
        seq($.keyword_restricted, $.keyword_caller),
      )),
    ),
  ),

  tag_assignment: $ => seq($.object_reference, '=', alias($._literal_string, $.literal)),

  _snowflake_column_action: $ => choice(
    seq($.keyword_set, $.keyword_masking, $.keyword_policy, $.object_reference, optional(seq($.keyword_using, paren_list($.identifier, true))), optional($.keyword_force)),
    seq($.keyword_unset, $.keyword_masking, $.keyword_policy),
    seq($.keyword_set, $.keyword_projection, $.keyword_policy, $.object_reference, optional($.keyword_force)),
    seq($.keyword_unset, $.keyword_projection, $.keyword_policy),
    seq($.keyword_set, $.keyword_tag, prec.right(comma_list($.tag_assignment, true))),
    seq($.keyword_unset, $.keyword_tag, prec.right(comma_list($.object_reference, true))),
    seq($.keyword_comment, alias($._literal_string, $.literal)),
  ),

};
