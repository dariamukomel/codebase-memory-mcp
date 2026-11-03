import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// ALTER for the account-level and platform objects (the ones create_platform.js creates). Their ALTER pages share
// one vocabulary: RENAME TO, SET / UNSET property lists, tags, SUSPEND / RESUME, and a few object-specific verbs.
// The kinds are listed explicitly; the verbs are the union of what those pages document.
// https://docs.snowflake.com/en/sql-reference/sql/alter-agent (and the sibling pages)
const KINDS = [
  'agent', 'aggregation policy', 'application role', 'application service', 'artifact repository', 'backup policy',
  'backup set', 'compute pool', 'connection', 'contact', 'data movement policy', 'data movement rule', 'database role',
  'dataset', 'dbt project', 'dcm project', 'event routing table', 'experiment', 'external access integration',
  'external agent', 'external consumer', 'failover group', 'feature policy', 'gateway', 'git repository',
  'join policy', 'listing', 'maintenance policy', 'model', 'model monitor', 'multi party approval policy',
  'network rule', 'notebook', 'online feature table', 'openflow connector', 'openflow data plane integration',
  'openflow deployment', 'openflow runtime', 'organization profile', 'organization user', 'organization user group',
  'packages policy', 'postgres instance', 'privacy policy', 'projection policy', 'replication group',
  'restricted session scope', 'rss', 'secret', 'service', 'snapshot', 'snapshot policy', 'snapshot set',
  'storage lifecycle policy',
];

const words = ($, phrases) => phrases.map((p) => seq(...p.split(' ').map((w) => $[`keyword_${w}`])));

export default {

  _alter_platform_kind: $ => choice(...words($, KINDS)),

  alter_platform_object: $ => seq(
    $.keyword_alter,
    $._alter_platform_kind,
    optional($._if_exists),
    $.object_reference,
    $._alter_platform_action,
  ),

  _alter_platform_action: $ => choice(
    $.rename_object,
    seq(optional($.keyword_force), $.keyword_set, choice(
      $._set_tag,
      seq($.keyword_body, '->', $._expression),
      seq($.identifier, $.keyword_as, $._policy_signature),
      seq($.keyword_rule, $.identifier, repeat($.snowflake_property)),
      seq($.keyword_default, $.keyword_release, $.keyword_directive, repeat($._version_property)),
      seq($.keyword_visibility, '=', $.keyword_accounts, comma_list($.object_reference, true)),
      seq($._set_properties_body, optional(seq($.keyword_apply, $.keyword_immediately))),
    )),
    seq($.keyword_unset, choice(
      $._unset_tag,
      seq($.keyword_rule, $.identifier),
      repeat1(seq($._unset_name, optional(','))),
    )),
    $.keyword_suspend,
    $.keyword_resume,
    $.keyword_fetch,
    $.keyword_publish,
    $.keyword_upgrade,
    $.keyword_primary,
    seq($.keyword_refresh, optional(alias($._literal_string, $.literal))),
    seq($.keyword_terminate, optional($.keyword_cascade)),
    seq($.keyword_commit, optional(choice($.keyword_run, $._comment_property)), optional($.identifier)),
    seq($.keyword_as, alias($._literal_string, $.literal)),
    seq($.keyword_from, $._platform_source, repeat($.snowflake_property)),
    seq($.keyword_deploy, $.keyword_from, alias($._literal_string, $.literal)),
    seq($.keyword_drop, $.keyword_deployment, $.identifier),
    seq(choice($.keyword_enable, $.keyword_disable), $.keyword_failover, optional(seq($.keyword_to, $.keyword_accounts, comma_list($.object_reference, true)))),
    // versioned objects (models, listings, datasets, profiles, connectors, external agents)
    seq($.keyword_add, $.keyword_version, optional($._if_not_exists), choice(
      seq($._version_name, optional(seq($.keyword_from, $._version_source)), repeat($._version_clause)),
      seq($.keyword_from, $._version_source, repeat($._version_clause)),
    )),
    seq($.keyword_drop, $.keyword_version, optional($._if_exists), $._version_name),
    seq($.keyword_modify, $.keyword_version, $._version_name, $.keyword_set, $._set_properties_body),
    seq($.keyword_version, $._version_name, $.keyword_set, $._set_properties_body),
    // experiments, backup sets, snapshot sets
    seq(choice($.keyword_add, $.keyword_commit), $.keyword_run, $.identifier),
    seq($.keyword_add, choice($.keyword_backup, $.keyword_snapshot)),
    seq($.keyword_apply, choice($.keyword_backup, $.keyword_snapshot), $.keyword_policy, $.object_reference, optional($.keyword_force)),
    seq($.keyword_delete, $.keyword_snapshot, $.keyword_identifier, alias($._literal_string, $.literal)),
    // organization user groups
    seq(choice($.keyword_add, $.keyword_remove), $.keyword_organization, $.keyword_users, comma_list($.object_reference, true)),
    // external consumers: programmatic access tokens
    $._pat_action,
  ),

  _version_name: $ => choice($.identifier, alias($._literal_string, $.literal)),

  _version_source: $ => choice(
    $._platform_source,
    wrapped_in_parenthesis($._dml_read),
  ),

  _version_clause: $ => choice(
    seq($.keyword_partition, $.keyword_by, $.identifier),
    $._comment_property,
    $.snowflake_property,
  ),

  // VERSION = v1 PATCH = 1
  _version_property: $ => choice(
    seq($.keyword_version, '=', choice($.identifier, alias($._literal_string, $.literal))),
    $.snowflake_property,
  ),

  _pat: $ => choice($.keyword_pat, seq($.keyword_programmatic, $.keyword_access, $.keyword_token)),

  // ADD | MODIFY | REMOVE | ROTATE { PAT | PROGRAMMATIC ACCESS TOKEN } [IF [NOT] EXISTS] name ...
  _pat_action: $ => choice(
    seq($.keyword_add, $._pat, optional($._if_not_exists), $.identifier, repeat(choice($._comment_property, $.snowflake_property))),
    seq($.keyword_modify, $._pat, optional($._if_exists), $.identifier, choice(
      seq($.keyword_rename, $.keyword_to, $.identifier),
      seq($.keyword_set, $._set_properties_body),
      seq($.keyword_unset, repeat1(seq($._unset_name, optional(',')))),
    )),
    seq($.keyword_remove, $._pat, optional($._if_exists), $.identifier),
    seq($.keyword_rotate, $._pat, optional($._if_exists), $.identifier, repeat($.snowflake_property)),
  ),

  // ADD | MODIFY | REMOVE | ROTATE KEY PAIR name ...
  _key_pair_action: $ => choice(
    seq($.keyword_add, $.keyword_key, $.keyword_pair, $.identifier, repeat(choice($._comment_property, $.snowflake_property))),
    seq($.keyword_modify, $.keyword_key, $.keyword_pair, $.identifier, choice(
      seq($.keyword_rename, $.keyword_to, $.identifier),
      seq($.keyword_set, $._set_properties_body),
      seq($.keyword_unset, repeat1(seq($._unset_name, optional(',')))),
    )),
    seq($.keyword_remove, $.keyword_key, $.keyword_pair, $.identifier),
    seq($.keyword_rotate, $.keyword_key, $.keyword_pair, $.identifier, repeat($.snowflake_property)),
  ),

  // ALTER TYPE [IF EXISTS] name { RENAME TO | SET COMMENT = '..' | UNSET COMMENT }
  alter_type: $ => seq(
    $.keyword_alter,
    $.keyword_type,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_set, $._comment_property),
      seq($.keyword_unset, $.keyword_comment),
    ),
  ),

  // ALTER APPLICATION [IF EXISTS] [name] { SET .. | UNSET .. | UPGRADE .. | APPROVE | DECLINE SPECIFICATION .. | ... }
  alter_application: $ => seq(
    $.keyword_alter,
    $.keyword_application,
    optional($._if_exists),
    optional($.object_reference),
    choice(
      $.rename_object,
      seq($.keyword_set, choice(
        seq($.keyword_specification, $.identifier, repeat($._spec_property)),
        seq($.keyword_configuration, $.keyword_definition, $.identifier, repeat($._spec_property)),
        seq($.keyword_configuration, $.identifier, $.keyword_value, '=', alias($._literal_string, $.literal)),
        $._set_tag,
        $._set_properties_body,
      )),
      seq($.keyword_unset, choice(
        seq($.keyword_configuration, $.identifier),
        $._unset_tag,
        repeat1(seq($._unset_name, optional(','))),
      )),
      seq($.keyword_drop, choice(
        seq($.keyword_specification, $.identifier),
        seq($.keyword_configuration, $.keyword_definition, $.identifier),
      )),
      seq(choice($.keyword_approve, $.keyword_decline), $.keyword_specification, $.identifier, repeat($.snowflake_property)),
      seq($.keyword_upgrade, optional(seq($.keyword_using, choice(
        seq($.keyword_version, $.identifier, optional(seq($.keyword_patch, alias($._integer, $.literal)))),
        alias($._literal_string, $.literal),
      )))),
    ),
  ),

  _spec_property: $ => choice(
    seq($.keyword_type, '=', choice(alias($._literal_string, $.literal), $.object_reference)),
    $.snowflake_property,
  ),

  // ALTER APPLICATION PACKAGE [IF EXISTS] name { SET .. | UNSET .. | ADD | DROP VERSION .. | MODIFY RELEASE .. }
  alter_application_package: $ => seq(
    $.keyword_alter,
    $.keyword_application,
    $.keyword_package,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_set, choice(
        seq($.keyword_default, $.keyword_release, $.keyword_directive, repeat($._version_property)),
        $._set_tag,
        $._set_properties_body,
      )),
      seq($.keyword_unset, choice($._unset_tag, repeat1(seq($._unset_name, optional(','))))),
      seq($.keyword_add, $.keyword_version, $.identifier, optional(seq($.keyword_using, alias($._literal_string, $.literal))), repeat($.snowflake_property)),
      seq($.keyword_drop, $.keyword_version, $.identifier),
      seq($.keyword_modify, $.keyword_release, choice(
        seq($.keyword_channel, $.identifier, choice(
          seq(choice($.keyword_add, $.keyword_drop), $.keyword_version, $.identifier),
          seq(choice($.keyword_add, $.keyword_remove), $.keyword_accounts, '=', $.copy_list),
          seq($.keyword_set, $._set_properties_body),
        )),
        seq($.keyword_directive, $.identifier, repeat($._version_property)),
      )),
    ),
  ),

  // ALTER SEMANTIC VIEW [IF EXISTS] name { RENAME TO | SET .. | UNSET .. | ADD | SUSPEND | REFRESH | DROP MATERIALIZATION .. }
  alter_semantic_view: $ => seq(
    $.keyword_alter,
    $.keyword_semantic,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      seq($.keyword_set, choice($._set_tag, $._set_properties_body)),
      seq($.keyword_unset, choice($._unset_tag, repeat1(seq($._unset_name, optional(','))))),
      seq($.keyword_add, $.keyword_materialization, $.identifier,
        repeat($.snowflake_property),
        optional(seq($.keyword_immutable, $.keyword_where, wrapped_in_parenthesis($._expression))),
        $.keyword_as, $.keyword_dimensions, comma_list($.object_reference, true),
        optional(seq($.keyword_metrics, comma_list($.object_reference, true))),
        optional(seq($.keyword_where, wrapped_in_parenthesis($._expression))),
      ),
      seq(choice($.keyword_suspend, $.keyword_refresh, $.keyword_drop), $.keyword_materialization, $.identifier),
    ),
  ),

  // ALTER ORGANIZATION [ACCOUNT [name]] { SET .. | UNSET .. }
  alter_organization: $ => seq(
    $.keyword_alter,
    $.keyword_organization,
    optional(seq($.keyword_account, optional($.object_reference))),
    choice(
      seq($.keyword_set, choice(
        seq($.keyword_event, $.keyword_routing, $.keyword_table, $.object_reference, $._for_all_listings),
        seq($.keyword_password, $.keyword_policy, $.object_reference),
        $._set_tag,
        $._set_properties_body,
      )),
      seq($.keyword_unset, choice(
        seq($.keyword_event, $.keyword_routing, $.keyword_table, $._for_all_listings),
        $._unset_tag,
        repeat1(seq($._unset_name, optional(','))),
      )),
    ),
  ),

  _for_all_listings: $ => seq($.keyword_for, $.keyword_all, $.keyword_application, $.keyword_listings),

};
