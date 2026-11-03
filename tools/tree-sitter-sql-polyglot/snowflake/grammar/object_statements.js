import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// DROP / UNDROP / DESCRIBE / SHOW share one object vocabulary in Snowflake. The singular names
// come from the DROP / DESCRIBE pages, the plural names from the SHOW pages:
// https://docs.snowflake.com/en/sql-reference/sql/drop (and the sibling pages)
const SINGULAR = [
  'alert', 'api integration', 'application', 'application package', 'application role', 'catalog integration',
  'compute pool', 'connection', 'cortex search service', 'database', 'dbt project', 'dcm project',
  'dynamic table', 'event table', 'external table', 'external volume', 'file format', 'hybrid table',
  'iceberg table', 'integration', 'managed account', 'masking policy', 'mcp server', 'model', 'network policy',
  'network rule', 'notebook', 'notification integration', 'password policy', 'pipe', 'resource monitor',
  'row access policy', 'schema', 'security integration', 'semantic view', 'session policy', 'share', 'snapshot',
  'storage integration', 'stage', 'role', 'database role', 'stream', 'streamlit', 'tag', 'task', 'user', 'warehouse', 'account',
  'agent', 'aggregation policy', 'application service', 'artifact repository', 'authentication policy',
  'backup policy', 'backup set', 'contact', 'data movement policy', 'data movement rule', 'event routing table',
  'experiment', 'external access integration', 'external agent', 'external consumer', 'failover group',
  'feature policy', 'gateway', 'git repository', 'image repository', 'join policy', 'listing',
  'maintenance policy', 'model monitor', 'multi party approval policy', 'online feature table',
  'openflow connector', 'openflow data plane integration', 'openflow deployment', 'openflow runtime',
  'organization profile', 'organization user', 'organization user group', 'packages policy', 'postgres instance',
  'privacy policy', 'projection policy', 'replication group', 'restricted session scope', 'rss', 'secret',
  'service', 'snapshot policy', 'snapshot set', 'storage lifecycle policy',
];

// Kinds only DESCRIBE knows: DESCRIBE <kind> name [IN APPLICATION app] ...
const DESCRIBE_ONLY = [
  'available listing', 'available organization profile', 'configuration', 'specification', 'type',
];

const PLURAL = [
  'alerts', 'applications', 'catalog integrations', 'columns', 'compute pools', 'connections',
  'cortex search services', 'databases', 'dbt projects', 'dcm projects', 'dynamic tables', 'event tables',
  'external functions', 'external tables', 'external volumes', 'file formats', 'functions', 'global accounts',
  'hybrid tables', 'iceberg tables', 'integrations', 'materialized views', 'masking policies', 'mcp servers',
  'network policies', 'network rules', 'notification integrations', 'objects', 'parameters', 'password policies',
  'pipes', 'primary keys', 'procedures', 'regions', 'replication accounts', 'replication databases',
  'resource monitors', 'roles', 'row access policies', 'schemas', 'sequences', 'session policies', 'shares',
  'stages', 'streamlits', 'streams', 'tables', 'tags', 'tasks', 'transactions', 'locks', 'user functions',
  'users', 'variables', 'views', 'warehouses', 'workspaces', 'imported keys', 'unique keys',
  'accounts', 'agents', 'aggregation policies', 'application packages', 'application roles', 'application services',
  'artifact repositories', 'authentication policies', 'available listings', 'available offers',
  'available organization profiles', 'backup policies', 'backup sets', 'backups', 'channels', 'classes',
  'code bundles', 'compute pool instance families', 'configurations', 'contacts', 'cortex base models',
  'data metric functions', 'data movement policies', 'data movement rules', 'database roles', 'datasets',
  'delegated authorizations', 'endpoints', 'entities', 'event routing table', 'event routing tables', 'experiments',
  'external access integrations', 'external agents', 'external consumers', 'failover groups', 'feature policies',
  'gateways', 'git branches', 'git repositories', 'git tags', 'image repositories', 'images', 'indexes', 'interactive tables',
  'job services', 'join policies', 'listings', 'maintenance policies', 'managed accounts', 'mfa methods',
  'model monitors', 'models', 'multi party approval policies', 'nodes', 'notebook projects', 'notebooks', 'offers',
  'online feature tables', 'openflow connector definitions', 'openflow connectors',
  'openflow data plane integrations', 'openflow deployments', 'openflow runtimes', 'organization accounts',
  'organization contracts', 'organization profiles', 'organization user groups', 'organization users',
  'packages policies', 'postgres instances', 'pricing plans', 'privacy policies', 'privileges', 'projection policies',
  'references', 'release channels', 'release directives', 'replication groups', 'restricted session scopes', 'rss',
  'rules', 'run metrics', 'run parameters', 'runs', 'secrets', 'semantic dimensions', 'semantic facts',
  'semantic metrics', 'semantic views', 'service containers', 'service instances', 'service volumes', 'services',
  'shared content', 'snapshot policies', 'snapshot sets', 'snapshots', 'specifications', 'approved specifications',
  'storage lifecycle policies', 'telemetry event definitions', 'types', 'user key pairs',
  'user pats', 'user procedures', 'user programmatic access tokens', 'user workload identity authentication methods',
  'versions',
];

const words = ($, kinds) => kinds.map((k) => seq(...k.split(' ').map((w) => $[`keyword_${w.replace(/ /g, '_')}`])));

export default {

  _snowflake_object_kind: $ => choice(...words($, SINGULAR)),

  _snowflake_describe_only_kind: $ => choice(...words($, DESCRIBE_ONLY)),

  _snowflake_object_kind_plural: $ => choice(...words($, PLURAL)),

  // name or name(argtypes) for functions and procedures
  _snowflake_object_name: $ => seq($.object_reference, optional(paren_list(choice($._type, seq($.keyword_table, paren_list($._type, false))), false))),

  // DROP <object> [IF EXISTS] name [(argtypes)] [CASCADE | RESTRICT | FORCE | GRACE_PERIOD_IN_DAYS = n]
  drop_object: $ => seq(
    $.keyword_drop,
    choice($._snowflake_object_kind, $.keyword_function, $.keyword_procedure, seq($.keyword_data, $.keyword_metric, $.keyword_function)),
    optional($._if_exists),
    $._snowflake_object_name,
    optional($._drop_behavior),
    optional($.keyword_purge),
    optional($.keyword_force),
    optional(seq($.keyword_grace_period_in_days, '=', alias($._integer, $.literal))),
  ),

  // UNDROP <object> name [RENAME TO new_name]
  undrop_statement: $ => seq(
    $.keyword_undrop,
    choice($._snowflake_object_kind, $.keyword_table, $.keyword_type),
    $.object_reference,
    optional(seq($.keyword_rename, $.keyword_to, $.identifier)),
  ),

  // DESCRIBE | DESC [AS RESOURCE] <object> name [TYPE = COLUMNS | STAGE | IN APPLICATION app | REVISION = DRAFT | PUBLISHED]
  describe_statement: $ => seq(
    choice($.keyword_describe, $.keyword_desc),
    optional(seq($.keyword_as, $.keyword_resource)),
    choice(
      seq(choice($._snowflake_object_kind, $._snowflake_describe_only_kind), $._snowflake_object_name),
      seq(choice($.keyword_table, $.keyword_view, $._materialized_view_kind, $.keyword_sequence), $._snowflake_object_name),
      seq(choice($.keyword_function, $.keyword_procedure), optional($._if_exists), $._snowflake_object_name),
      seq($.keyword_result, $._expression),
      seq($.keyword_transaction, alias($._integer, $.literal)),
      seq($.keyword_search, $.keyword_optimization, $.keyword_on, $.object_reference),
    ),
    optional(choice(
      seq($.keyword_type, '=', choice($.keyword_columns, $.keyword_stage)),
      seq($.keyword_in, $.keyword_application, $.object_reference),
      seq($.keyword_revision, '=', choice($.keyword_draft, $.keyword_published)),
    )),
  ),

  _materialized_view_kind: $ => seq($.keyword_materialized, $.keyword_view),

  // SHOW [TERSE] <objects> [HISTORY] [LIKE [PATTERN] '...'] [IN <scope>] [ON ...] [FOR ...] [STARTS WITH '...']
  //   [LIMIT n [FROM '...']] ...  The clauses are the union of what the SHOW pages document.
  // SHOW [FUTURE | CALLER] GRANTS ...
  show_statement: $ => seq(
    $.keyword_show,
    optional($.keyword_terse),
    choice(
      seq(
        optional(choice($.keyword_future, $.keyword_caller)),
        $.keyword_grants,
        optional(choice(
          seq($.keyword_on, choice($.keyword_account, seq(choice($._snowflake_object_kind, $.keyword_table, $.keyword_view, $.keyword_function, $.keyword_procedure, $.keyword_sequence), $._snowflake_object_name))),
          seq($.keyword_to, $._show_grants_grantee),
          seq($.keyword_of, choice(
            seq(choice($.keyword_role, $.keyword_share), $.object_reference),
            seq($.keyword_application, $.keyword_role, $.object_reference),
            seq($.keyword_service, $.keyword_role, $.service_role_reference),
          )),
          seq($.keyword_in, choice($.keyword_database, $.keyword_schema, seq($.keyword_dcm, $.keyword_project)), $.object_reference),
        )),
        optional(seq($.keyword_limit, alias($._integer, $.literal))),
      ),
      seq(
        choice($._snowflake_object_kind_plural, $.keyword_deployments),
        repeat($._show_clause),
      ),
    ),
  ),

  // GRANTS TO <grantee>
  _show_grants_grantee: $ => choice(
    seq(choice($.keyword_role, $.keyword_user), $.object_reference),
    seq($.keyword_share, $.object_reference, optional(seq($.keyword_in, $.keyword_application, $.keyword_package, $.object_reference))),
    seq($.keyword_application, optional($.keyword_role), $.object_reference),
    seq($.keyword_database, $.keyword_role, $.object_reference),
    seq($.keyword_service, $.keyword_role, $.service_role_reference),
    seq($.object_reference, $.keyword_role, $.service_role_reference),
  ),

  // svc!role: an instance role (service, class instance) addressed through its owner
  service_role_reference: $ => seq($.object_reference, '!', $.identifier),

  _show_clause: $ => choice(
    $.keyword_history,
    seq($.keyword_like, optional($.keyword_pattern), alias($._literal_string, $.literal)),
    seq($.keyword_in, $._show_scope),
    seq($.keyword_on, $._show_on_target),
    seq($.keyword_for, $._show_for_target),
    seq($.keyword_by, $.keyword_user, $.object_reference),
    seq($.keyword_to, $.keyword_security, $.keyword_integration, $.object_reference),
    seq($.keyword_of, $.keyword_type, comma_list($.identifier, true)),
    seq($.keyword_owned, $.keyword_by, $.keyword_application, $.object_reference),
    seq($.keyword_starts, $.keyword_with, alias($._literal_string, $.literal)),
    seq($.keyword_root, $.keyword_only),
    seq($.keyword_exclude, $.keyword_jobs),
    seq(
      $.keyword_limit,
      field('limit', alias($._integer, $.literal)),
      optional(seq($.keyword_from, alias($._literal_string, $.literal))),
    ),
    seq($.keyword_with, $.keyword_privileges, comma_list($._show_privilege, true)),
    seq($.keyword_with, $.keyword_primary, $.object_reference),
    seq($.keyword_run, $.object_reference),
    seq($.keyword_version, $.object_reference),
    seq(field('name', $.identifier), '=', choice($.keyword_true, $.keyword_false)),
  ),

  _show_privilege: $ => prec.right(seq($.identifier, optional(choice($.identifier, $.keyword_table)))),

  _show_on_target: $ => choice(
    $.keyword_account,
    seq(choice($.keyword_user, $.keyword_table, $.keyword_application), $.object_reference),
    seq($.keyword_organization, $.keyword_for, $.keyword_all, $.keyword_application, $.keyword_listings),
  ),

  _show_for_target: $ => choice(
    seq($.keyword_user, $.object_reference),
    seq($.keyword_external, $.keyword_consumer, $.object_reference),
    seq($.keyword_metric, $.object_reference),
    seq($.keyword_version, $.object_reference),
    seq($.keyword_release, $.keyword_channel, $.object_reference),
  ),

  _show_scope: $ => choice(
    prec.right(seq($.keyword_account, optional($.object_reference))),
    $.keyword_session,
    prec.right(seq($.keyword_database, optional($.object_reference))),
    prec.right(seq($.keyword_schema, optional($.object_reference))),
    prec.right(seq($.keyword_table, optional($.object_reference))),
    seq($.keyword_application, optional($.keyword_package), $.object_reference),
    seq($.keyword_dcm, $.keyword_project, $.object_reference),
    seq($.keyword_event, $.keyword_routing, $.keyword_table, choice($.object_reference, wrapped_in_parenthesis($.object_reference))),
    seq(choice(
      $.keyword_view, $.keyword_task, $.keyword_warehouse, $.keyword_class, $.keyword_listing, $.keyword_model,
      $.keyword_service, $.keyword_experiment, $.keyword_gateway, $.keyword_pipe, $.keyword_dataset,
      seq($.keyword_failover, $.keyword_group), seq($.keyword_replication, $.keyword_group),
      seq($.keyword_backup, $.keyword_set), seq($.keyword_snapshot, $.keyword_set),
      seq($.keyword_image, $.keyword_repository), seq($.keyword_git, $.keyword_repository),
      seq($.keyword_compute, $.keyword_pool), seq($.keyword_dbt, $.keyword_project),
      seq($.keyword_openflow, $.keyword_connector), seq($.keyword_organization, $.keyword_profile),
      seq($.keyword_organization, $.keyword_user, $.keyword_group),
      seq($.keyword_release, $.keyword_channel),
    ), $.object_reference),
    // IN <schema> APPLICATION <app>
    seq($.object_reference, $.keyword_application, $.object_reference),
    $.object_reference,
  ),

};
