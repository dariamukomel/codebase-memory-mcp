import { comma_list, paren_list } from '../../grammar/helpers.js';

// GRANT / REVOKE as Snowflake documents them:
// https://docs.snowflake.com/en/sql-reference/sql/grant-privilege (and the sibling pages)
const PRIVILEGES = [
  'select', 'insert', 'update', 'delete', 'truncate', 'references', 'usage', 'monitor', 'operate', 'modify',
  'read', 'write', 'audit', 'evolve schema', 'attach policy', 'apply', 'apply masking policy',
  'apply row access policy', 'apply tag', 'apply session policy', 'apply password policy', 'apply aggregation policy',
  'apply projection policy', 'apply authentication policy', 'apply packages policy', 'bind service endpoint',
  'import share', 'import database', 'manage grants', 'manage warehouses', 'monitor usage', 'monitor execution',
  'monitor security', 'execute task', 'execute managed task', 'execute alert', 'override share restrictions',
  'reference usage', 'purchase data exchange listing', 'create share', 'execute', 'trigger',
];

const word = ($, w) => $[`keyword_${w}`];

export default {

  grant_statement: $ => seq(
    $.keyword_grant,
    choice(
      seq($._grant_privileges, $.keyword_on, $._grant_target, $.keyword_to, $._grantee),
      seq($._grant_role_kind, $.object_reference, $.keyword_to, $._grantee),
      seq($.keyword_ownership, $.keyword_on, $._grant_target, $.keyword_to, $._grantee,
        optional($.copy_grants_clause)),
      seq($.keyword_caller, $._grant_privileges, $.keyword_on, $._grant_target, $.keyword_to, $._grantee),
      seq($.keyword_all, $.keyword_caller, $.keyword_privileges, $.keyword_on, $._grant_target, $.keyword_to, $._grantee),
      seq($.keyword_all, $.keyword_inherited, $.keyword_caller, $.keyword_privileges, $.keyword_on, $._inherited_target, $.keyword_to, $._grantee),
      seq($.keyword_inherited, $.keyword_caller, $._grant_privileges, $.keyword_on, $._inherited_target, $.keyword_to, $._grantee),
      seq($.keyword_service, $.keyword_role, $.service_role_reference, $.keyword_to, $._grantee),
    ),
    optional(seq($.keyword_with, $.keyword_grant, $.keyword_option)),
  ),

  revoke_statement: $ => seq(
    $.keyword_revoke,
    optional(seq($.keyword_grant, $.keyword_option, $.keyword_for)),
    choice(
      seq($._grant_privileges, $.keyword_on, $._grant_target, $.keyword_from, $._grantee),
      seq($._grant_role_kind, $.object_reference, $.keyword_from, $._grantee),
      seq($.keyword_caller, $._grant_privileges, $.keyword_on, $._grant_target, $.keyword_from, $._grantee),
      seq(optional($.keyword_all), $.keyword_inherited, $.keyword_caller, optional($.keyword_privileges), $.keyword_on, $._inherited_target, $.keyword_from, $._grantee),
      seq($.keyword_service, $.keyword_role, $.service_role_reference, $.keyword_from, $._grantee),
    ),
    optional(choice($.keyword_cascade, $.keyword_restrict)),
  ),

  copy_grants_clause: $ => seq(choice($.keyword_revoke, $.keyword_copy), $.keyword_current, $.keyword_grants),

  _grant_role_kind: $ => choice(
    $.keyword_role,
    seq($.keyword_database, $.keyword_role),
    seq($.keyword_application, $.keyword_role),
  ),

  _grant_privileges: $ => choice(
    seq($.keyword_all, optional($.keyword_privileges)),
    comma_list($._grant_privilege, true),
  ),

  _grant_privilege: $ => choice(
    ...PRIVILEGES.map((p) => seq(...p.split(' ').map((w) => word($, w.replace(/ /g, '_'))))),
    seq($.keyword_create, choice(
      $.keyword_table, $.keyword_view, $.keyword_function, $.keyword_procedure, $.keyword_sequence, $.keyword_role,
      seq($.keyword_materialized, $.keyword_view), seq($.keyword_dynamic, $.keyword_table),
      seq($.keyword_external, $.keyword_table), seq($.keyword_file, $.keyword_format), $.keyword_stage, $.keyword_stream,
      $.keyword_task, $.keyword_pipe, $.keyword_tag, $.keyword_database, $.keyword_schema, $.keyword_warehouse,
      $.keyword_user, $.keyword_integration, seq($.keyword_network, $.keyword_policy), $.keyword_share,
      seq($.keyword_masking, $.keyword_policy), seq($.keyword_row, $.keyword_access, $.keyword_policy),
      $.object_reference,
    )),
  ),

  _grant_target: $ => choice(
    $.keyword_account,
    seq($.keyword_all, $._snowflake_object_kind_plural, $.keyword_in, choice($.keyword_database, $.keyword_schema), $.object_reference),
    seq($.keyword_future, $._snowflake_object_kind_plural, $.keyword_in, choice($.keyword_database, $.keyword_schema), $.object_reference),
    seq($.keyword_data, $.keyword_exchange, $.keyword_listing, $.object_reference),
    seq(choice($._snowflake_object_kind, $.keyword_table, $.keyword_view, $.keyword_function, $.keyword_procedure, $.keyword_sequence),
      $.object_reference, optional(paren_list($._type, false))),
    $.object_reference,
  ),

  // ON { ALL | FUTURE } <objects> IN { ACCOUNT | DATABASE d | SCHEMA s }
  _inherited_target: $ => seq(
    choice($.keyword_all, $.keyword_future),
    $._snowflake_object_kind_plural,
    $.keyword_in,
    choice($.keyword_account, seq(choice($.keyword_database, $.keyword_schema), $.object_reference)),
  ),

  _grantee: $ => choice(
    seq(choice(
      $.keyword_role, $.keyword_user, $.keyword_share, $.keyword_application,
      seq($.keyword_database, $.keyword_role), seq($.keyword_application, $.keyword_role),
    ), $.object_reference),
    $.identifier,
  ),

};
