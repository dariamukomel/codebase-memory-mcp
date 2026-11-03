import { comma_list, paren_list } from '../../grammar/helpers.js';

// ALTER statements for the remaining Snowflake objects. Each rule lists only the actions the object's
// ALTER page documents; SET / UNSET property lists reuse the shared clauses in alter_objects.js.
const alterHead = ($, ...kind) => seq($.keyword_alter, ...kind, optional($._if_exists), $.object_reference);

const setUnset = ($) => [
  seq($.keyword_set, choice($._set_tag, $._set_properties)),
  seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
];

export default {

  alter_file_format: $ => seq(alterHead($, $.keyword_file, $.keyword_format), choice($.rename_object, ...setUnset($))),

  alter_share: $ => seq(
    alterHead($, $.keyword_share),
    choice(
      seq(choice($.keyword_add, $.keyword_remove), $._share_accounts, repeat($.snowflake_property)),
      seq($.keyword_set, choice(seq($._share_accounts, repeat($.snowflake_property)), $._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  _share_accounts: $ => seq($.keyword_accounts, '=', comma_list($.object_reference, true)),

  alter_network_policy: $ => seq(
    alterHead($, $.keyword_network, $.keyword_policy),
    choice(
      $.rename_object,
      seq(choice($.keyword_add, $.keyword_remove), $._set_properties),
      ...setUnset($),
    ),
  ),

  // ALTER { MASKING POLICY | ROW ACCESS POLICY } name { RENAME TO | SET BODY -> expr | SET .. | UNSET .. }
  alter_masking_policy: $ => seq(
    alterHead($, $.keyword_masking, $.keyword_policy),
    choice($.rename_object, seq($.keyword_set, $.keyword_body, '->', $._expression), ...setUnset($)),
  ),

  alter_row_access_policy: $ => seq(
    alterHead($, $.keyword_row, $.keyword_access, $.keyword_policy),
    choice($.rename_object, seq($.keyword_set, $.keyword_body, '->', $._expression), ...setUnset($)),
  ),

  alter_tag: $ => seq(
    alterHead($, $.keyword_tag),
    choice(
      $.rename_object,
      seq(choice($.keyword_add, $.keyword_drop, $.keyword_set), $.keyword_allowed_values, comma_list(alias($._literal_string, $.literal), true)),
      seq($.keyword_unset, $.keyword_allowed_values),
      seq($.keyword_set, $.keyword_masking, $.keyword_policy, comma_list($._masking_policy_ref, true), optional($.keyword_force)),
      seq($.keyword_unset, $.keyword_masking, $.keyword_policy, comma_list($._masking_policy_ref, true)),
      seq($.keyword_set, $.keyword_data, $.keyword_movement, $.keyword_policy, $.object_reference, optional($.keyword_force)),
      seq($.keyword_unset, $.keyword_data, $.keyword_movement, $.keyword_policy),
      seq($.keyword_set, $._set_properties),
      seq($.keyword_unset, $._unset_properties),
    ),
  ),

  _masking_policy_ref: $ => seq(optional(seq($.keyword_masking, $.keyword_policy)), $.object_reference),

  alter_external_table: $ => seq(
    alterHead($, $.keyword_external, $.keyword_table),
    choice(
      $.rename_object,
      seq($.keyword_refresh, optional(alias($._literal_string, $.literal))),
      seq(choice($.keyword_add, $.keyword_remove), $.keyword_files, paren_list(alias($._literal_string, $.literal), true)),
      seq($.keyword_add, $.keyword_partition, paren_list(seq($.identifier, '=', $._expression), true), $.keyword_location, alias($._literal_string, $.literal)),
      seq($.keyword_drop, $.keyword_partition, $.keyword_location, alias($._literal_string, $.literal)),
      ...setUnset($),
    ),
  ),

  alter_iceberg_table: $ => seq(
    alterHead($, $.keyword_iceberg, $.keyword_table),
    choice(
      $._alter_specifications,
      $._cluster_by,
      seq($.keyword_convert, $.keyword_to, $.keyword_managed, repeat($.snowflake_property)),
      seq($.keyword_drop, $.keyword_partition, $.keyword_by, paren_list($._expression, true)),
      seq($.keyword_replace, $.keyword_partition, $.keyword_by, paren_list($._expression, true), $.keyword_with, paren_list($._expression, true)),
      seq($.keyword_refresh, optional(alias($._literal_string, $.literal))),
    ),
  ),

  // ALTER [STORAGE | API | NOTIFICATION | SECURITY | CATALOG] INTEGRATION name { SET .. | UNSET .. }
  alter_integration: $ => seq(
    alterHead($, optional(choice($.keyword_storage, $.keyword_api, $.keyword_notification, $.keyword_security, $.keyword_catalog)), $.keyword_integration),
    choice(
      seq($.keyword_refresh, $.identifier),
      ...setUnset($),
    ),
  ),

  // Policies, monitors and other objects whose ALTER page offers rename, SET / UNSET and a few verbs.
  alter_account_object: $ => seq(
    alterHead($, choice(
      seq($.keyword_password, $.keyword_policy),
      seq($.keyword_session, $.keyword_policy),
      seq($.keyword_authentication, $.keyword_policy),
      seq($.keyword_resource, $.keyword_monitor),
      seq($.keyword_external, $.keyword_volume),
      $.keyword_streamlit,
      seq($.keyword_cortex, $.keyword_search, $.keyword_service),
    )),
    choice(
      $.rename_object,
      seq(choice($.keyword_suspend, $.keyword_resume), optional($.keyword_indexing)),
      $.keyword_pull,
      seq($.keyword_add, $.keyword_storage_location, '=', $.snowflake_property_list),
      seq($.keyword_remove, $.keyword_storage_location, alias($._literal_string, $.literal)),
      seq($.keyword_triggers, repeat1(seq($.keyword_on, alias($._natural_number, $.literal), $.keyword_percent, $.keyword_do, choice($.keyword_notify, $.keyword_suspend, $.keyword_suspend_immediate)))),
      ...setUnset($),
    ),
  ),

  snowflake_property_list: $ => seq('(', repeat1($.snowflake_property), ')'),

  alter_account: $ => seq(
    $.keyword_alter, $.keyword_account,
    choice(
      seq($.keyword_set, choice(
        seq($.keyword_authentication, $.keyword_policy, $.object_reference, optional(seq($.keyword_for, $.keyword_all, $.keyword_person, $.keyword_users)), optional($.keyword_force)),
        $._set_tag,
        $._set_properties,
      )),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_database: $ => seq(
    alterHead($, $.keyword_database),
    choice(
      $.rename_object,
      seq($.keyword_swap, $.keyword_with, $.object_reference),
      seq(choice($.keyword_enable, $.keyword_disable), choice($.keyword_replication, $.keyword_failover), optional(seq($.keyword_to, $.keyword_accounts, comma_list($.object_reference, true), optional(seq($.keyword_ignore, $.keyword_edition, $.keyword_check))))),
      $.keyword_primary,
      $.keyword_refresh,
      seq(choice($.keyword_suspend, $.keyword_resume), $.keyword_discovery),
      seq($.keyword_update, $.keyword_linked_catalog, choice(
        seq(choice($.keyword_add, $.keyword_remove), paren_list(alias($._literal_string, $.literal), true), choice($.keyword_to, $.keyword_from), $.identifier),
        seq($.keyword_set, $._set_properties_body),
        seq($.keyword_unset, $._unset_properties),
      )),
      seq($.keyword_set, choice($._set_contact, seq($.keyword_feature, $.keyword_policy, $.object_reference, optional($.keyword_force)), $._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_schema: $ => seq(
    alterHead($, $.keyword_schema),
    choice(
      $.rename_object,
      seq($.keyword_swap, $.keyword_with, $.object_reference),
      seq(choice($.keyword_enable, $.keyword_disable), $.keyword_managed, $.keyword_access),
      seq($.keyword_set, choice($._set_tag, $._set_properties)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_sequence: $ => seq(
    alterHead($, $.keyword_sequence),
    choice(
      $.rename_object,
      seq($.keyword_set, repeat1(choice(
        seq($.keyword_increment, optional($.keyword_by), optional('='), alias($._integer, $.literal)),
        $.keyword_order,
        $.keyword_noorder,
        $._set_tag,
        $.snowflake_property,
      ))),
      seq($.keyword_increment, optional($.keyword_by), optional('='), alias($._integer, $.literal)),
      seq($.keyword_unset, choice($._unset_tag, $._unset_properties)),
    ),
  ),

  alter_stage: $ => seq(
    alterHead($, $.keyword_stage),
    choice(
      $.rename_object,
      seq($.keyword_refresh, optional(seq($.keyword_subpath, '=', alias($._literal_string, $.literal)))),
      ...setUnset($),
    ),
  ),

};
