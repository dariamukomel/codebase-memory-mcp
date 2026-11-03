import { comma_list, paren_list } from '../../grammar/helpers.js';

// Amazon Redshift statements that had no rule at all. Every shape below is
// transcribed from the Syntax block of that command's own page under
// https://docs.aws.amazon.com/redshift/latest/dg/c_SQL_commands.html
export default {

  // ── SHOW ────────────────────────────────────────────────────────────────
  // Redshift spells its catalog introspection as ~18 separate SHOW commands.
  // They share enough shape to live in one rule; each alternative is a
  // distinct documented command, not a generalisation.
  show_statement: $ => prec.right(seq(
    $.keyword_show,
    choice(
      // SHOW { parameter_name | ALL }
      choice($.keyword_all, field('parameter', $.identifier)),
      // SHOW COLUMNS FROM TABLE ref [LIKE '…'] [LIMIT n]
      seq($.keyword_columns, $.keyword_from, $.keyword_table, $.object_reference),
      // SHOW { TABLES | SCHEMAS | FUNCTIONS | PROCEDURES | TEMPLATES }
      //   FROM { SCHEMA | DATABASE } ref
      seq(
        choice(
          $.keyword_tables,
          $.keyword_schemas,
          $.keyword_functions,
          $.keyword_procedures,
          $.keyword_templates,
        ),
        $.keyword_from,
        choice($.keyword_schema, $.keyword_database),
        $.object_reference,
      ),
      // SHOW DATABASES
      $.keyword_databases,
      // SHOW DATASHARES
      $.keyword_datashares,
      // SHOW { TABLE | VIEW | TEMPLATE } ref
      seq(choice($.keyword_table, $.keyword_view, $.keyword_template), $.object_reference),
      // SHOW EXTERNAL TABLE ref [PARTITION]
      seq(
        $.keyword_external,
        $.keyword_table,
        $.object_reference,
        optional($.keyword_partition),
      ),
      // SHOW MODEL { ALL | name }
      seq($.keyword_model, choice($.keyword_all, $.object_reference)),
      // SHOW PROCEDURE name [(argtype, …)]
      seq($.keyword_procedure, $.object_reference, optional(paren_list($._type))),
      // SHOW PARAMETERS OF { FUNCTION | PROCEDURE } ref(argtype, …)
      seq(
        $.keyword_parameters,
        $.keyword_of,
        choice($.keyword_function, $.keyword_procedure),
        $.object_reference,
        optional(paren_list($._type)),
      ),
      // SHOW CONSTRAINTS { PRIMARY KEYS | FOREIGN KEYS [EXPORTED] } FROM TABLE ref
      seq(
        $.keyword_constraints,
        choice(
          seq($.keyword_primary, $.keyword_keys),
          seq($.keyword_foreign, $.keyword_keys, optional($.keyword_exported)),
        ),
        $.keyword_from,
        $.keyword_table,
        $.object_reference,
      ),
      // SHOW COLUMN GRANTS ON TABLE ref [FOR principal]
      seq(
        $.keyword_column,
        $.keyword_grants,
        $.keyword_on,
        $.keyword_table,
        $.object_reference,
        optional(seq($.keyword_for, $._rs_principal)),
      ),
      // SHOW GRANTS [ON grant_object] [FOR principal]
      seq(
        $.keyword_grants,
        optional(seq($.keyword_on, $._grant_object)),
        optional(seq($.keyword_for, $._rs_principal)),
      ),
      // SHOW { RLS | MASKING } POLICIES
      //   [ ON ref [FOR principal] | FROM DATABASE name ]
      seq(
        choice($.keyword_rls, $.keyword_masking),
        $.keyword_policies,
        optional(choice(
          seq(
            $.keyword_on,
            $.object_reference,
            optional(seq($.keyword_for, $._rs_principal)),
          ),
          seq($.keyword_from, $.keyword_database, $.object_reference),
        )),
      ),
    ),
    optional($._rs_like_filter),
    optional($.limit),
  )),

  _rs_like_filter: $ => seq($.keyword_like, alias($._literal_string, $.literal)),

  // { user | ROLE role | GROUP group | PUBLIC }
  _rs_principal: $ => choice(
    seq($.keyword_role, field('role', $.identifier)),
    seq($.keyword_group, field('group', $.identifier)),
    $.keyword_public,
    field('user', $.identifier),
  ),

  // ── Session / process control ───────────────────────────────────────────

  // CANCEL process_id ['message']
  cancel_statement: $ => prec.right(seq(
    $.keyword_cancel,
    field('process_id', alias($._natural_number, $.literal)),
    optional(field('message', alias($._literal_string, $.literal))),
  )),

  // ABORT [WORK | TRANSACTION]; Redshift's synonym for ROLLBACK.
  abort_statement: $ => prec.right(seq(
    $.keyword_abort,
    optional(choice($.keyword_work, $.keyword_transaction)),
  )),

  // END [WORK | TRANSACTION]; Redshift's synonym for COMMIT.
  // Negative precedence because base's BEGIN … END procedure body also ends
  // with a bare END: at the end of a statement inside a body, closing the
  // body has to win over starting an END statement.
  end_statement: $ => prec(-1, prec.right(seq(
    $.keyword_end,
    optional(choice($.keyword_work, $.keyword_transaction)),
  ))),

  // LOCK [TABLE] t [, …]
  lock_statement: $ => seq(
    $.keyword_lock,
    optional($.keyword_table),
    comma_list($.object_reference, true),
  ),

  // CALL sp_name([arg, …])
  call_statement: $ => seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    paren_list($._expression),
  ),

  // CLOSE cursor
  close_statement: $ => seq(
    $.keyword_close,
    field('cursor', $.identifier),
  ),

  // FETCH [NEXT | ALL | FORWARD [count | ALL]] FROM cursor
  fetch_statement: $ => seq(
    $.keyword_fetch,
    optional(choice(
      $.keyword_next,
      $.keyword_all,
      seq(
        $.keyword_forward,
        optional(choice($.keyword_all, alias($._natural_number, $.literal))),
      ),
    )),
    $.keyword_from,
    field('cursor', $.identifier),
  ),

  // ANALYZE [VERBOSE] [table [(col, …)]] [PREDICATE COLUMNS | ALL COLUMNS]
  analyze_statement: $ => prec.right(seq(
    $.keyword_analyze,
    optional($.keyword_verbose),
    optional(seq(
      field('table', $.object_reference),
      optional(paren_list($.identifier, true)),
    )),
    optional(seq(
      choice($.keyword_predicate, $.keyword_all),
      $.keyword_columns,
    )),
  )),

  // SET [LOCAL] SESSION AUTHORIZATION { user | DEFAULT }
  set_session_authorization: $ => seq(
    $.keyword_set,
    optional($.keyword_local),
    $.keyword_session,
    $.keyword_authorization,
    choice($.keyword_default, field('user', $.identifier)),
  ),

  // ── Row-level security and dynamic data masking ─────────────────────────

  // CREATE MASKING POLICY name [IF NOT EXISTS] WITH (cols) USING (expr)
  create_masking_policy: $ => seq(
    $.keyword_create,
    $.keyword_masking,
    $.keyword_policy,
    field('name', $.object_reference),
    optional($._if_not_exists),
    $.keyword_with,
    $.column_definitions,
    $.keyword_using,
    '(',
    field('expression', $._expression),
    ')',
  ),

  // ALTER MASKING POLICY name USING (expr)
  alter_masking_policy: $ => seq(
    $.keyword_alter,
    $.keyword_masking,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_using,
    '(',
    field('expression', $._expression),
    ')',
  ),

  // DROP MASKING POLICY name
  drop_masking_policy: $ => seq(
    $.keyword_drop,
    $.keyword_masking,
    $.keyword_policy,
    field('name', $.object_reference),
  ),

  // ATTACH MASKING POLICY p ON rel (cols) [USING (cols)] TO principal
  //   [PRIORITY n]
  attach_masking_policy: $ => prec.right(seq(
    $.keyword_attach,
    $.keyword_masking,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_on,
    field('relation', $.object_reference),
    paren_list($.identifier, true),
    optional(seq($.keyword_using, paren_list($.identifier, true))),
    $.keyword_to,
    $._rs_principal,
    optional(seq($.keyword_priority, alias($._natural_number, $.literal))),
  )),

  // DETACH MASKING POLICY p ON rel (cols) FROM principal
  detach_masking_policy: $ => seq(
    $.keyword_detach,
    $.keyword_masking,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_on,
    field('relation', $.object_reference),
    paren_list($.identifier, true),
    $.keyword_from,
    $._rs_principal,
  ),

  // CREATE RLS POLICY p [WITH (col type, …) [AS alias]] USING (predicate)
  create_rls_policy: $ => seq(
    $.keyword_create,
    $.keyword_rls,
    $.keyword_policy,
    field('name', $.object_reference),
    optional(seq(
      $.keyword_with,
      $.column_definitions,
      optional(seq(optional($.keyword_as), field('alias', $.identifier))),
    )),
    $.keyword_using,
    '(',
    field('predicate', $._expression),
    ')',
  ),

  // ALTER RLS POLICY p USING (predicate)
  alter_rls_policy: $ => seq(
    $.keyword_alter,
    $.keyword_rls,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_using,
    '(',
    field('predicate', $._expression),
    ')',
  ),

  // DROP RLS POLICY [IF EXISTS] p [CASCADE | RESTRICT]
  drop_rls_policy: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_rls,
    $.keyword_policy,
    optional($._if_exists),
    field('name', $.object_reference),
    optional($._drop_behavior),
  )),

  // ATTACH RLS POLICY p ON [TABLE] t [, …] TO principal [, …]
  attach_rls_policy: $ => seq(
    $.keyword_attach,
    $.keyword_rls,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_on,
    optional($.keyword_table),
    comma_list($.object_reference, true),
    $.keyword_to,
    comma_list($._rs_principal, true),
  ),

  // DETACH RLS POLICY p ON [TABLE] t [, …] FROM principal [, …]
  detach_rls_policy: $ => seq(
    $.keyword_detach,
    $.keyword_rls,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_on,
    optional($.keyword_table),
    comma_list($.object_reference, true),
    $.keyword_from,
    comma_list($._rs_principal, true),
  ),

  // ── Identity providers, libraries, COPY job templates ───────────────────

  // CREATE IDENTITY PROVIDER name TYPE t NAMESPACE ns [option …]
  // ALTER  IDENTITY PROVIDER name [option …]
  // The trailing option set (TYPE/NAMESPACE/PARAMETERS/IAM_ROLE/
  // AUTO_CREATE_ROLES/APPLICATION_ARN/…) is open-ended and order-free, so it
  // is accepted as a repeat of option forms rather than a fixed sequence.
  create_identity_provider: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter),
    $.keyword_identity,
    $.keyword_provider,
    field('name', $.identifier),
    repeat($._identity_provider_option),
  )),

  _identity_provider_option: $ => choice(
    seq($.keyword_type, field('type', $.identifier)),
    seq($.keyword_namespace, field('namespace', $.identifier)),
    seq($.keyword_parameters, alias($._literal_string, $.literal)),
    seq($.keyword_iam_role, choice($.keyword_default, alias($._literal_string, $.literal))),
    $.option_pair,
  ),

  // One `NAME [AS] value` option. The value is mandatory on purpose: with an
  // optional value, a repeat of this rule cannot tell whether the identifier
  // after an option name is that option's value or the next option's name.
  option_pair: $ => seq(
    field('option', $.identifier),
    optional($.keyword_as),
    field('value', choice($.literal, $.identifier)),
  ),

  // DROP IDENTITY PROVIDER name [CASCADE]
  drop_identity_provider: $ => prec.right(seq(
    $.keyword_drop,
    $.keyword_identity,
    $.keyword_provider,
    field('name', $.identifier),
    optional($.keyword_cascade),
  )),

  // DESC IDENTITY PROVIDER name
  // DESC DATASHARE name [OF [ACCOUNT id] NAMESPACE guid]
  desc_statement: $ => seq(
    $.keyword_desc,
    choice(
      seq($.keyword_identity, $.keyword_provider, field('name', $.identifier)),
      seq(
        $.keyword_datashare,
        field('name', $.identifier),
        optional(seq(
          $.keyword_of,
          optional(seq($.keyword_account, alias($._literal_string, $.literal))),
          $.keyword_namespace,
          alias($._literal_string, $.literal),
        )),
      ),
    ),
  ),

  // CREATE [OR REPLACE] LIBRARY name LANGUAGE plpythonu FROM '…' [option …]
  create_library: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_library,
    field('name', $.identifier),
    $.keyword_language,
    field('language', $.identifier),
    $.keyword_from,
    alias($._literal_string, $.literal),
    repeat($._identity_provider_option),
  )),

  // DROP LIBRARY name
  drop_library: $ => seq(
    $.keyword_drop,
    $.keyword_library,
    field('name', $.identifier),
  ),

  // CREATE [OR REPLACE] TEMPLATE name FOR COPY [AS] [FORMAT [AS] fmt]
  //   [parameter [argument] [, …]]
  // The documented `[[FORMAT] [AS] data_format]` allows the format name to
  // stand entirely alone, which would be indistinguishable from the first
  // parameter; FORMAT is required here to keep the two apart.
  create_template: $ => prec.right(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_template,
    field('name', $.object_reference),
    $.keyword_for,
    $.keyword_copy,
    optional($.keyword_as),
    optional(seq(
      $.keyword_format,
      optional($.keyword_as),
      field('format', $.identifier),
    )),
    optional(comma_list($.template_parameter, true)),
  )),

  // Commas make the argument safely optional here, unlike option_pair.
  template_parameter: $ => seq(
    field('parameter', $.identifier),
    optional(field('argument', choice($.literal, $.identifier))),
  ),

  // ALTER TEMPLATE name { RENAME TO … | OWNER TO … | ADD … | DROP … | SET … }
  alter_template: $ => seq(
    $.keyword_alter,
    $.keyword_template,
    field('name', $.object_reference),
    choice(
      seq($.keyword_rename, $.keyword_to, field('new_name', $.identifier)),
      seq($.keyword_owner, $.keyword_to, field('new_owner', $.identifier)),
      seq(
        $.keyword_add,
        field('parameter', $.identifier),
        optional($.keyword_as),
        optional(choice($.literal, $.identifier)),
      ),
      seq($.keyword_drop, field('parameter', $.identifier)),
      seq(
        $.keyword_set,
        comma_list(
          seq(field('parameter', $.identifier), $.keyword_to, choice($.literal, $.identifier)),
          true,
        ),
      ),
    ),
  ),

  // DROP TEMPLATE name
  drop_template: $ => seq(
    $.keyword_drop,
    $.keyword_template,
    field('name', $.object_reference),
  ),

  // ── Remaining one-offs ──────────────────────────────────────────────────

  // ALTER SYSTEM SET setting = value
  alter_system_statement: $ => seq(
    $.keyword_alter,
    $.keyword_system,
    $.keyword_set,
    field('setting', $.identifier),
    '=',
    field('value', choice($.literal, $.identifier)),
  ),

  // ALTER DEFAULT PRIVILEGES [FOR USER u [, …]] [IN SCHEMA s [, …]]
  //   { GRANT … | REVOKE … }
  alter_default_privileges: $ => seq(
    $.keyword_alter,
    $.keyword_default,
    $.keyword_privileges,
    optional(seq(
      $.keyword_for,
      $.keyword_user,
      comma_list($.identifier, true),
    )),
    optional(seq(
      $.keyword_in,
      $.keyword_schema,
      comma_list($.object_reference, true),
    )),
    choice($.grant_statement, $.revoke_statement),
  ),

  // CREATE EXTERNAL VIEW s.v [IF NOT EXISTS] catalog_ref AS query
  create_external_view: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_view,
    field('name', $.object_reference),
    optional($._if_not_exists),
    field('target', $.object_reference),
    $.keyword_as,
    $.create_query,
  ),

  // ALTER EXTERNAL VIEW s.v catalog_ref [FORCE] { AS (query) | REMOVE DEFINITION }
  alter_external_view: $ => seq(
    $.keyword_alter,
    $.keyword_external,
    $.keyword_view,
    field('name', $.object_reference),
    field('target', $.object_reference),
    optional($.keyword_force),
    choice(
      seq($.keyword_as, '(', $._dml_read, ')'),
      seq($.keyword_remove, $.keyword_definition),
    ),
  ),

  // DROP EXTERNAL VIEW s.v [IF EXISTS] catalog_ref
  drop_external_view: $ => seq(
    $.keyword_drop,
    $.keyword_external,
    $.keyword_view,
    field('name', $.object_reference),
    optional($._if_exists),
    field('target', $.object_reference),
  ),

  // DROP MODEL [IF EXISTS] name
  drop_model: $ => seq(
    $.keyword_drop,
    $.keyword_model,
    optional($._if_exists),
    field('name', $.object_reference),
  ),

};
