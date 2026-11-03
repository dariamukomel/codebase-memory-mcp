import { paren_list, comma_list } from '../../grammar/helpers.js';

export default {

  // Override _column_constraint to add DISTKEY, SORTKEY, ENCODE
  _column_constraint: $ => prec.left(choice(
    choice($.keyword_null, $._not_null),
    seq(
      $.keyword_references,
      $.object_reference,
      paren_list($.identifier, true),
      repeat(
        seq(
          $.keyword_on,
          choice($.keyword_delete, $.keyword_update),
          choice(
            seq($.keyword_no, $.keyword_action),
            $.keyword_restrict,
            $.keyword_cascade,
            seq(
              $.keyword_set,
              choice($.keyword_null, $.keyword_default),
              optional(paren_list($.identifier, true)),
            ),
          ),
        ),
      ),
    ),
    $._default_expression,
    $._primary_key,
    $.direction,
    $._column_comment,
    $._check_constraint,
    seq(
      optional(seq($.keyword_generated, $.keyword_always)),
      $.keyword_as,
      $._expression,
    ),
    $.keyword_unique,
    // Redshift-specific column-level constraints
    $.keyword_distkey,
    $.keyword_sortkey,
    seq($.keyword_encode, field('encoding', $.identifier)),
  )),

  // Override create_table to add Redshift distribution/sort options
  create_table: $ => prec.left(seq(
    $.keyword_create,
    optional($._temporary),
    $.keyword_table,
    optional($._if_not_exists),
    field("target", $.object_reference),
    seq(
      optional($.column_definitions),
      optional(seq($.keyword_as, $.create_query)),
    ),
    optional($._redshift_diststyle),
    optional($._redshift_distkey),
    optional($._redshift_sortkey),
  )),

  // DISTSTYLE KEY | EVEN | ALL | AUTO
  _redshift_diststyle: $ => seq(
    $.keyword_diststyle,
    choice(
      $.keyword_key,
      $.keyword_even,
      $.keyword_all,
      $.keyword_auto,
    ),
  ),

  // DISTKEY(col)
  _redshift_distkey: $ => seq(
    $.keyword_distkey,
    paren_list($.identifier, true),
  ),

  // [COMPOUND | INTERLEAVED] SORTKEY(cols)
  _redshift_sortkey: $ => seq(
    optional(choice($.keyword_compound, $.keyword_interleaved)),
    $.keyword_sortkey,
    paren_list($.identifier, true),
  ),

  // CREATE MATERIALIZED VIEW mv [BACKUP YES|NO] [AUTO REFRESH YES|NO] AS query
  create_materialized_view: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_not_exists),
    field('target', $.object_reference),
    repeat(choice(
      seq($.keyword_backup, choice($.keyword_yes, $.keyword_no)),
      seq($.keyword_auto, $.keyword_refresh, choice($.keyword_yes, $.keyword_no)),
    )),
    $.keyword_as,
    field('query', $.create_query),
  )),

  // CREATE MODEL name FROM {ref | (query)} [TARGET col] [FUNCTION fn]
  //   [IAM_ROLE {DEFAULT|'arn'}] [AUTO {ON|OFF} | key value …]
  //   [SETTINGS (key 'value', …)]  (Redshift ML)
  create_model: $ => prec.right(seq(
    $.keyword_create,
    $.keyword_model,
    optional($._if_not_exists),
    $.object_reference,
    $.keyword_from,
    choice($.subquery, $.object_reference),
    optional(seq($.keyword_target, $.identifier)),
    optional(seq($.keyword_function, $.identifier)),
    optional(seq($.keyword_iam_role, choice($.keyword_default, alias($._literal_string, $.literal)))),
    repeat($.model_parameter),
    optional(seq(
      $.keyword_settings,
      paren_list(seq(field('key', $.identifier), optional(alias($._literal_string, $.literal))), true),
    )),
  )),

  model_parameter: $ => choice(
    seq($.keyword_auto, choice($.keyword_on, $.keyword_off)),
    seq(field('key', $.identifier), field('value', choice($.identifier, alias($._literal_string, $.literal)))),
  ),

  // CREATE DATASHARE ds [SET PUBLICACCESSIBLE {TRUE|FALSE}]
  create_datashare: $ => seq(
    $.keyword_create,
    $.keyword_datashare,
    optional($._if_not_exists),
    $.object_reference,
  ),

  // ALTER DATASHARE ds {ADD|REMOVE} {TABLE ref | SCHEMA ref} [, …]
  alter_datashare: $ => seq(
    $.keyword_alter,
    $.keyword_datashare,
    $.object_reference,
    repeat1(seq(
      choice($.keyword_add, $.keyword_remove),
      choice(
        seq($.keyword_table, comma_list($.object_reference, true)),
        seq($.keyword_schema, comma_list($.object_reference, true)),
      ),
    )),
  ),

  // Override _create_statement to add Redshift-specific CREATE variants
  // No CREATE INDEX: Redshift has no traditional indexes (uses sort/dist keys).
  _create_statement: $ => seq(
    choice(
      $.create_table,
      $.create_view,
      $.create_materialized_view,
      $.create_function,
      $.create_procedure,
      $.create_type,
      $.create_database,
      $.create_role,
      $.create_sequence,
      $.create_trigger,
      $.create_external_schema,
      $.create_external_table,
      $.create_external_function,
      $.create_datashare,
      $.create_model,
      prec.left(seq(
        $.create_schema,
        repeat($._create_statement),
      )),
    ),
  ),

  // CREATE [OR REPLACE] EXTERNAL FUNCTION name (argtype, …) RETURNS type
  //   [VOLATILE|STABLE|IMMUTABLE] LAMBDA 'fn' IAM_ROLE 'arn:…'
  create_external_function: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_external,
    $.keyword_function,
    $.object_reference,
    '(',
    optional(comma_list($._type, true)),
    ')',
    $.keyword_returns,
    $._type,
    optional(choice($.keyword_volatile, $.keyword_stable, $.keyword_immutable)),
    $.keyword_lambda,
    alias($._literal_string, $.literal),
    $.keyword_iam_role,
    alias($._literal_string, $.literal),
  ),

  // CREATE EXTERNAL SCHEMA [IF NOT EXISTS] name
  //   FROM { DATA CATALOG | POSTGRES | MYSQL | KINESIS | MSK | REDSHIFT }
  //   [DATABASE 'db'] [SCHEMA 's'] [URI 'host' [PORT n]]
  //   IAM_ROLE 'arn:…' [SECRET_ARN 'arn:…']
  //   [CREATE EXTERNAL DATABASE IF NOT EXISTS]
  // DATA CATALOG is the Spectrum/Glue form; the engine names are the
  // federated-query forms, which reach a remote instance over URI/PORT.
  create_external_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_schema,
    optional($._if_not_exists),
    $.identifier,
    $.keyword_from,
    choice(
      seq($.keyword_data, $.keyword_catalog),
      $.keyword_postgres,
      $.keyword_mysql,
      $.keyword_kinesis,
      $.keyword_msk,
      $.keyword_redshift,
    ),
    optional(seq($.keyword_database, alias($._literal_string, $.literal))),
    optional(seq($.keyword_schema, alias($._literal_string, $.literal))),
    optional(seq($.keyword_uri, alias($._literal_string, $.literal))),
    optional(seq($.keyword_port, $.literal)),
    optional(seq($.keyword_iam_role, alias($._literal_string, $.literal))),
    optional(seq($.keyword_secret_arn, alias($._literal_string, $.literal))),
    optional(seq(
      $.keyword_create,
      $.keyword_external,
      $.keyword_database,
      $._if_not_exists,
    )),
  )),

  // CREATE EXTERNAL TABLE [IF NOT EXISTS] ref (cols)
  //   [PARTITIONED BY (col type, ...)]
  //   [ROW FORMAT DELIMITED [FIELDS TERMINATED BY 'x']]
  //   STORED AS format
  //   LOCATION 's3://...'
  create_external_table: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_table,
    optional($._if_not_exists),
    $.object_reference,
    $.column_definitions,
    optional(seq(
      $.keyword_partitioned, $.keyword_by,
      paren_list($.column_definition, true),
    )),
    optional(seq(
      $.keyword_row, $.keyword_format,
      $.keyword_delimited,
      optional(seq(
        $.keyword_fields, $.keyword_terminated, $.keyword_by,
        alias($._literal_string, $.literal),
      )),
    )),
    seq($.keyword_stored, $.keyword_as, $.identifier),
    seq($.keyword_location, alias($._literal_string, $.literal)),
  ),

  // Override _alter_specifications to add Redshift external table partition ops
  // and distribution/sort key changes
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
    $.alter_diststyle_clause,
    $.alter_sortkey_clause,
    // APPEND FROM src: move blocks from one table to another
    seq($.keyword_append, $.keyword_from, field('source', $.object_reference)),
    // ADD PARTITION (key=val, ...) LOCATION '...'
    seq(
      $.keyword_add, $.keyword_partition,
      paren_list(seq($.identifier, '=', $._expression), true),
      $.keyword_location, alias($._literal_string, $.literal),
    ),
    // DROP PARTITION (key=val, ...)
    seq(
      $.keyword_drop, $.keyword_partition,
      paren_list(seq($.identifier, '=', $._expression), true),
    ),
    // SET TABLE PROPERTIES ('numRows' = '1000', …); the external-table
    // option list.
    seq(
      $.keyword_set, $.keyword_table, $.keyword_properties,
      paren_list(seq(
        field('key', alias($._literal_string, $.literal)),
        '=',
        field('value', alias($._literal_string, $.literal)),
      ), true),
    ),
  ),

  // ALTER DISTSTYLE KEY DISTKEY col | EVEN | ALL
  alter_diststyle_clause: $ => seq(
    $.keyword_alter, $.keyword_diststyle,
    choice(
      seq($.keyword_key, $.keyword_distkey, $.identifier),
      $.keyword_even,
      $.keyword_all,
    ),
  ),

  // ALTER [COMPOUND|INTERLEAVED] SORTKEY (cols) | SORTKEY NONE
  alter_sortkey_clause: $ => seq(
    $.keyword_alter,
    optional(choice($.keyword_compound, $.keyword_interleaved)),
    $.keyword_sortkey,
    choice(
      paren_list($.identifier, true),
      $.keyword_none,
    ),
  ),

  // ── User / Group management ──────────────────────────────────────────────────
  // Base grammar handles CREATE/ALTER/DROP USER|GROUP|ROLE natively.
  // Redshift-specific additions:

  // Extend _role_options with Redshift-only role/user options
  _role_options: $ => choice(
    // Inherited base options (PASSWORD, CONNECTION LIMIT, VALID UNTIL, bare identifier)
    seq(optional($.keyword_encrypted), $.keyword_password,
        choice(field('password', alias($._literal_string, $.literal)), $.keyword_null)),
    seq($.keyword_valid, $.keyword_until,
        field('valid_until', alias($._literal_string, $.literal))),
    seq($.keyword_connection, $.keyword_limit,
        field('connection_limit', alias($._integer, $.literal))),
    field('option', $.identifier),
    // Redshift-specific user options
    $.keyword_nocreatedb,
    $.keyword_nocreateuser,
    seq($.keyword_session, $.keyword_timeout, alias($._integer, $.literal)),
    seq($.keyword_syslog, $.keyword_access,
        choice($.keyword_unrestricted, $.keyword_restricted)),
  ),

  // DROP USER|GROUP|ROLE [IF EXISTS] name [, name …]  (Redshift allows a list)
  drop_role: $ => seq(
    $.keyword_drop,
    choice(
      $.keyword_group,
      $.keyword_role,
      $.keyword_user,
    ),
    optional($._if_exists),
    comma_list($.identifier, true),
  ),

  // ALTER GROUP name ADD|DROP USER name [, name]  (unique Redshift form)
  alter_group_statement: $ => seq(
    $.keyword_alter,
    $.keyword_group,
    $.identifier,
    choice($.keyword_add, $.keyword_drop),
    $.keyword_user,
    comma_list($.identifier, true),
  ),

  // SET identifier TO value | DEFAULT  (Redshift session variable form)
  set_session_variable_statement: $ => seq(
    $.keyword_set,
    $.object_reference,
    $.keyword_to,
    choice($._expression, $.keyword_default),
  ),

};
