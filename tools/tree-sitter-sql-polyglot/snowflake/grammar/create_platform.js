import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

// CREATE for the account-level and platform objects (Cortex, Native Apps, replication, Openflow, services,
// policies, organization objects, ...). Their CREATE pages share one shape: a name followed by a mix of
// NAME = value properties and a few keyword clauses (FROM <source>, AS <body>, IN <container>, FOR <object>,
// WITH TAG, ...). The kinds are listed explicitly; the clause set is the union of what those pages document.
// https://docs.snowflake.com/en/sql-reference/sql/create-agent (and the sibling pages)
const KINDS = [
  'account', 'agent', 'aggregation policy', 'application', 'application package', 'application role',
  'application service', 'artifact repository', 'backup policy', 'backup set', 'connection', 'contact',
  'code bundle', 'data movement policy', 'data movement rule', 'event routing table', 'experiment',
  'external agent', 'external consumer', 'external listing', 'feature policy', 'gateway', 'git repository',
  'image repository', 'interactive warehouse', 'join policy', 'listing', 'maintenance policy', 'managed account',
  'model', 'model monitor', 'multi party approval policy', 'notebook', 'notebook project',
  'online feature table', 'openflow connector', 'openflow deployment', 'openflow runtime', 'organization account',
  'organization listing', 'organization profile', 'organization user', 'organization user group',
  'packages policy', 'postgres instance', 'privacy policy', 'projection policy', 'provisioned throughput',
  'restricted session scope', 'rss', 'secret', 'service', 'snapshot', 'snapshot policy', 'snapshot set',
  'storage lifecycle policy', 'versioned schema',
];

const words = ($, phrases) => phrases.map((p) => seq(...p.split(' ').map((w) => $[`keyword_${w}`])));

export default {

  _platform_kind: $ => choice(...words($, KINDS)),

  // CREATE [OR REPLACE | OR ALTER] <kind> [IF NOT EXISTS] name <clauses>
  create_platform_object: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $._platform_kind,
    optional($._if_not_exists),
    $.object_reference,
    repeat(seq($._platform_clause, optional(','))),
  ),

  // CREATE [OR REPLACE] DATASET [IF NOT EXISTS] name   (the docs also show IF NOT EXISTS before DATASET)
  create_dataset: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($._if_not_exists),
    $.keyword_dataset,
    optional($._if_not_exists),
    $.object_reference,
  ),

  _platform_clause: $ => choice(
    $.clone_clause,
    $.tag_clause,
    $.contact_clause,
    $._comment_property,
    // VERSION v1 | WITH VERSION v1 | VERSION = 'v1'
    seq(optional($.keyword_with), $.keyword_version, choice(
      $.identifier,
      alias($._literal_string, $.literal),
      seq('=', choice(alias($._literal_string, $.literal), $.identifier)),
    )),
    // TYPE = PYPI | TYPE = 'AI_FUNCTION_EVALUATION'
    seq($.keyword_type, '=', choice(alias($._literal_string, $.literal), $.object_reference)),
    seq($.keyword_from, $._platform_source),
    seq($.keyword_using, choice(
      seq($.keyword_release, $.keyword_channel, $.identifier),
      alias($._literal_string, $.literal),
      paren_list($.named_argument, true),
    )),
    seq($.keyword_as, choice(
      alias($._literal_string, $.literal),
      seq($.keyword_replica, $.keyword_of, $.object_reference),
      $._policy_signature,
      wrapped_in_parenthesis($._dml_read),
    )),
    // MAX_ROWS AS () RETURNS INTEGER -> (1000)
    seq($.identifier, $.keyword_as, $._policy_signature),
    seq($.keyword_in, choice(
      seq($.keyword_compute, $.keyword_pool, $.object_reference),
      seq($.keyword_runtime, $.object_reference),
      seq($.keyword_deployment, $.object_reference),
    )),
    seq($.keyword_for, $._snowflake_object_kind, $.object_reference),
    seq($.keyword_for, $.keyword_table, $.object_reference),
    seq(optional($.keyword_with), choice(
      seq($.keyword_retention, $.keyword_lock),
      seq($.keyword_backup, $.keyword_policy, $.object_reference),
      seq($.keyword_snapshot, $.keyword_policy, $.object_reference),
      seq($.keyword_managed, $.keyword_access),
      seq($.keyword_rules, $.identifier, '=', $.copy_list),
    )),
    seq($.keyword_ignore, $.keyword_edition, $.keyword_check),
    seq($.keyword_language, $.identifier),
    seq($.keyword_primary, $.keyword_key, paren_list($.identifier, true)),
    prec.right(seq($.keyword_attributes, comma_list($.identifier, true))),
    seq($.keyword_on, $.identifier),
    prec.right(seq($.keyword_text, $.keyword_indexes, comma_list($.identifier, true))),
    prec.right(seq($.keyword_vector, $.keyword_indexes, comma_list(seq($.identifier, optional($.copy_list)), true))),
    seq($.keyword_tables, paren_list($.object_reference, true)),
    seq($.keyword_fork, $.object_reference, $.keyword_at, paren_list($.named_argument, true)),
    seq($.keyword_application, $.keyword_package, $.object_reference),
    seq($.keyword_share, $.object_reference),
    seq(optional($.keyword_with), $.snowflake_property),
  ),

  // FROM <source>
  _platform_source: $ => choice(
    alias($._literal_string, $.literal),
    $.stage_ref,
    seq($.keyword_specification, alias($._literal_string, $.literal)),
    seq($.keyword_specification_template, alias($._literal_string, $.literal)),
    seq($.keyword_definition, $.identifier),
    seq($.keyword_service, $.object_reference, $.keyword_volume, $.identifier, $.keyword_instance, alias($._integer, $.literal)),
    seq($.keyword_experiment, $.object_reference, $.keyword_run, $.identifier),
    seq($.keyword_model, $.object_reference, $.keyword_version, $.identifier),
    seq($.keyword_artifact, $.keyword_repository, $.object_reference, $.keyword_package, $.object_reference, $.keyword_version, $.identifier),
    seq($.keyword_application, $.keyword_package, $.object_reference),
    $.object_reference,
  ),

  // (arg TYPE, ...) RETURNS type -> expression
  _policy_signature: $ => prec.right(seq(
    paren_list(seq($.identifier, $._type), false),
    $.keyword_returns,
    $._type,
    '->',
    $._expression,
  )),

  // CREATE {FAILOVER | REPLICATION} GROUP [IF NOT EXISTS] name
  //   { AS REPLICA OF src | OBJECT_TYPES = a, b ALLOWED_DATABASES = d1, d2 ... }
  create_replication_group: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    choice($.keyword_failover, $.keyword_replication),
    $.keyword_group,
    optional($._if_not_exists),
    $.object_reference,
    choice(
      seq($.keyword_as, $.keyword_replica, $.keyword_of, $.object_reference),
      repeat($._group_clause),
    ),
  ),

  _group_clause: $ => choice(
    $.tag_clause,
    seq($.keyword_ignore, $.keyword_edition, $.keyword_check),
    seq($.identifier, '=', comma_list($._group_item, true)),
  ),

  // USERS | RESOURCE MONITORS | SECURITY INTEGRATIONS | db1 | myorg.acct2 | '10 MINUTE' | TRUE
  _group_item: $ => choice(
    alias($._literal_string, $.literal),
    $.keyword_true,
    $.keyword_false,
    seq($.object_reference, optional(choice(
      $.keyword_monitors, $.keyword_integrations, $.keyword_policies, $.keyword_parameters, $.keyword_pools, $.keyword_volumes,
    ))),
  ),

  // CREATE AI FUNCTION name (args) RETURNS type [COMMENT = ..] { AS <body> | FROM EXPERIMENT e RUN r }
  create_ai_function: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_ai,
    $.keyword_function,
    optional($._if_not_exists),
    $.object_reference,
    paren_list($.routine_argument, false),
    $.keyword_returns,
    $._type,
    repeat($._comment_property),
    choice(
      seq($.keyword_as, alias($._literal_string, $.literal)),
      seq($.keyword_from, $.keyword_experiment, $.object_reference, $.keyword_run, $.identifier),
    ),
  ),

  // CREATE INTERACTIVE TABLE name [(columns)] [CLUSTER BY (..)] [TARGET_LAG = ..] [WAREHOUSE = ..] [COMMENT = ..] AS query
  create_interactive_table: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_interactive,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    optional($.column_definitions),
    repeat(choice(
      $.cluster_by_clause,
      $.tag_clause,
      $._comment_property,
      $.snowflake_property,
    )),
    $.keyword_as,
    $.create_query,
  ),

  // CREATE [OR ALTER] TYPE [IF NOT EXISTS] name AS <type> [COMMENT = ..]
  create_type: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_type,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_as,
    $._type,
    repeat($._comment_property),
  ),

  // CREATE [OR REPLACE | OR ALTER] SEMANTIC VIEW [IF NOT EXISTS] name
  //   TABLES (...) [RELATIONSHIPS (...)] [FACTS (...)] [DIMENSIONS (...)] [METRICS (...)] [COMMENT = ..] [COPY GRANTS]
  create_semantic_view: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    $.keyword_semantic,
    $.keyword_view,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_tables, paren_list($.semantic_table, true),
    optional(seq($.keyword_relationships, paren_list($.semantic_relationship, true))),
    optional(seq($.keyword_facts, paren_list($.semantic_item, true))),
    optional(seq($.keyword_dimensions, paren_list($.semantic_item, true))),
    optional(seq($.keyword_metrics, paren_list($.semantic_item, true))),
    repeat(choice(
      $._comment_property,
      seq($.keyword_copy, $.keyword_grants),
      seq($.keyword_with, $.keyword_extension, paren_list($.snowflake_property, true)),
    )),
  ),

  // [alias AS] table [PRIMARY KEY (cols)] [UNIQUE (cols)] [WITH SYNONYMS ('..')] [COMMENT = '..']
  semantic_table: $ => seq(
    optional(seq($.identifier, $.keyword_as)),
    $.object_reference,
    optional(seq($.keyword_primary, $.keyword_key, paren_list($.identifier, true))),
    repeat(seq($.keyword_unique, paren_list($.identifier, true))),
    optional($._semantic_synonyms),
    optional($._comment_property),
  ),

  // [name AS] table (cols) REFERENCES table [(cols)]
  semantic_relationship: $ => seq(
    optional(seq($.identifier, $.keyword_as)),
    $.identifier,
    paren_list($.identifier, true),
    $.keyword_references,
    $.identifier,
    optional(paren_list($.identifier, true)),
  ),

  // [PRIVATE | PUBLIC] [table.]name AS expression [WITH SYNONYMS ('..')] [COMMENT = '..']
  semantic_item: $ => seq(
    optional(choice($.keyword_private, $.keyword_public)),
    $.object_reference,
    $.keyword_as,
    $._expression,
    optional($._semantic_synonyms),
    optional($._comment_property),
  ),

  _semantic_synonyms: $ => seq(
    $.keyword_with, $.keyword_synonyms, optional('='),
    paren_list(alias($._literal_string, $.literal), true),
  ),

};
