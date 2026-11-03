import { wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // SHOW CREATE {SCHEMA|TABLE|VIEW|USER|TRIGGER|PROCEDURE|FUNCTION}
  _show_create: $ => seq(
    $.keyword_create,
    choice(
      $.keyword_schema,
      $.keyword_table,
      seq(optional($.keyword_materialized), $.keyword_view),
      $.keyword_user,
      $.keyword_trigger,
      $.keyword_procedure,
      $.keyword_function
    ),
    $.object_reference
  ),

  // Athena / Spark UNLOAD
  _unload_statement: $ => seq(
    $.keyword_unload,
    wrapped_in_parenthesis($._select_statement),
    $.keyword_to,
    $._single_quote_string,
    $.storage_parameters,
  ),

  // SHOW CATALOGS [LIKE pattern]
  _show_catalogs: $ => seq(
    $.keyword_catalogs,
    optional(seq($.keyword_like, $.literal)),
  ),

  // SHOW NAMESPACES [FROM catalog | IN catalog] [LIKE pattern]
  _show_namespaces: $ => seq(
    $.keyword_namespaces,
    optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
    optional(seq($.keyword_like, $.literal)),
  ),

  // SHOW VOLUMES [IN catalog.schema]
  _show_volumes: $ => seq(
    $.keyword_volumes,
    optional(seq($.keyword_in, $.object_reference)),
  ),

  // SHOW GRANTS [principal] ON securable_object
  _show_grants: $ => seq(
    $.keyword_grants,
    optional($.identifier),
    $.keyword_on,
    choice(
      seq($.keyword_catalog, $.object_reference),
      seq($.keyword_schema, $.object_reference),
      seq(choice($.keyword_table, $.keyword_view), $.object_reference),
      seq($.keyword_volume, $.object_reference),
      seq($.keyword_external, $.keyword_location, $.object_reference),
      seq($.keyword_connection, $.object_reference),
      seq($.keyword_credential, $.object_reference),
      seq($.keyword_share, $.object_reference),
      seq($.keyword_recipient, $.object_reference),
    ),
  ),

  // SHOW CONNECTIONS | CREDENTIALS | SHARES | RECIPIENTS | PROVIDERS
  _show_uc_object_type: $ => choice(
    $.keyword_connections,
    $.keyword_credentials,
    $.keyword_shares,
    $.keyword_recipients,
    $.keyword_providers,
    // Unity Catalog object types previously missing from SHOW
    $.keyword_users,
    $.keyword_policies,
    seq($.keyword_external, $.keyword_locations),
  ),

  // SHOW PROCEDURES [ { FROM | IN } schema ]
  _show_procedures: $ => seq(
    $.keyword_procedures,
    optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
  ),

  // SHOW TABLES DROPPED [ { FROM | IN } schema ]
  _show_tables_dropped: $ => seq(
    $.keyword_tables,
    $.keyword_dropped,
    optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
  ),

  // SHOW TBLPROPERTIES table [(key)]
  _show_tblproperties: $ => prec.left(seq(
    $.keyword_tblproperties,
    $.object_reference,
    optional(seq('(', $.identifier, ')')),
  )),

  // SHOW PARTITIONS table [PARTITION (spec)]
  _show_partitions: $ => seq(
    $.keyword_partitions,
    $.object_reference,
    optional($._partition_spec),
  ),

  // SHOW COLUMNS {FROM | IN} table [{FROM | IN} db]
  _show_columns: $ => seq(
    $.keyword_columns,
    choice($.keyword_from, $.keyword_in),
    $.object_reference,
    optional(seq(choice($.keyword_from, $.keyword_in), $.object_reference)),
  ),

};
