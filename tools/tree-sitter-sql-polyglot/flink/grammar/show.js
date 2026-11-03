import { paren_list } from '../../grammar/helpers.js';

// Optional [NOT] (LIKE|ILIKE) pattern filter
function like_filter($) {
  return seq(
    optional($.keyword_not),
    choice($.keyword_like, $.keyword_ilike),
    alias($._literal_string, $.literal),
  );
}

// Optional FROM|IN qualifier
function from_in($) {
  return seq(
    choice($.keyword_from, $.keyword_in),
    $.object_reference,
  );
}

export default {

  show_statement: $ => choice(
    $.show_catalogs,
    $.show_current_catalog,
    $.show_databases,
    $.show_current_database,
    $.show_tables,
    $.show_views,
    $.show_materialized_tables,
    $.show_columns,
    $.show_functions,
    $.show_procedures,
    $.show_partitions,
    $.show_models,
    $.show_connections,
    $.show_modules,
    $.show_jars,
    $.show_jobs,
    $.show_create,
  ),

  // SHOW CATALOGS [[NOT] (LIKE|ILIKE) pattern]
  show_catalogs: $ => seq(
    $.keyword_show,
    $.keyword_catalogs,
    optional(like_filter($)),
  ),

  // SHOW CURRENT CATALOG
  show_current_catalog: $ => seq(
    $.keyword_show,
    $.keyword_current,
    $.keyword_catalog,
  ),

  // SHOW DATABASES [FROM|IN catalog] [[NOT] (LIKE|ILIKE) pattern]
  show_databases: $ => seq(
    $.keyword_show,
    $.keyword_databases,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW CURRENT DATABASE
  show_current_database: $ => seq(
    $.keyword_show,
    $.keyword_current,
    $.keyword_database,
  ),

  // SHOW TABLES [FROM|IN [cat.]db] [[NOT] LIKE pattern]
  show_tables: $ => seq(
    $.keyword_show,
    $.keyword_tables,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW VIEWS [FROM|IN [cat.]db] [[NOT] LIKE pattern]
  show_views: $ => seq(
    $.keyword_show,
    $.keyword_views,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW MATERIALIZED TABLES [FROM|IN [cat.]db] [[NOT] LIKE pattern]
  show_materialized_tables: $ => seq(
    $.keyword_show,
    $.keyword_materialized,
    $.keyword_tables,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW [FULL] COLUMNS (FROM|IN) [[cat.]db.]tbl [[NOT] LIKE pattern]
  show_columns: $ => seq(
    $.keyword_show,
    optional($.keyword_full),
    $.keyword_columns,
    from_in($),
    optional(like_filter($)),
  ),

  // SHOW [USER] FUNCTIONS [FROM|IN [cat.]db] [[NOT] (LIKE|ILIKE) pattern]
  show_functions: $ => seq(
    $.keyword_show,
    optional($.keyword_user),
    $.keyword_functions,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW PROCEDURES [FROM|IN [cat.]db] [[NOT] (LIKE|ILIKE) pattern]
  show_procedures: $ => seq(
    $.keyword_show,
    $.keyword_procedures,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW PARTITIONS [[cat.]db.]tbl [PARTITION (spec)]
  show_partitions: $ => seq(
    $.keyword_show,
    $.keyword_partitions,
    $.object_reference,
    optional(seq(
      $.keyword_partition,
      paren_list(seq($.identifier, '=', $.literal), true),
    )),
  ),

  // SHOW MODELS [FROM|IN [cat.]db] [[NOT] LIKE pattern]
  show_models: $ => seq(
    $.keyword_show,
    $.keyword_models,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW CONNECTIONS [FROM|IN [cat.]db] [[NOT] LIKE pattern]
  show_connections: $ => seq(
    $.keyword_show,
    $.keyword_connections,
    optional(from_in($)),
    optional(like_filter($)),
  ),

  // SHOW [FULL] MODULES
  show_modules: $ => seq(
    $.keyword_show,
    optional($.keyword_full),
    $.keyword_modules,
  ),

  // SHOW JARS
  show_jars: $ => seq(
    $.keyword_show,
    $.keyword_jars,
  ),

  // SHOW JOBS
  show_jobs: $ => seq(
    $.keyword_show,
    $.keyword_jobs,
  ),

  // SHOW CREATE (TABLE|VIEW|CATALOG|MODEL|CONNECTION|MATERIALIZED TABLE) [OR ALTER] name
  show_create: $ => seq(
    $.keyword_show,
    $.keyword_create,
    choice(
      seq($.keyword_table, $.object_reference),
      seq($.keyword_view, $.object_reference),
      seq($.keyword_catalog, $.object_reference),
      seq($.keyword_model, optional(seq($.keyword_or, $.keyword_alter)), $.object_reference),
      seq($.keyword_connection, $.object_reference),
      seq($.keyword_materialized, $.keyword_table, optional(seq($.keyword_or, $.keyword_alter)), $.object_reference),
    ),
  ),

  // (DESCRIBE|DESC) target
  describe_statement: $ => seq(
    choice($.keyword_describe, $.keyword_desc),
    choice(
      seq(optional($.keyword_extended), $.object_reference),
      seq($.keyword_database, optional($.keyword_extended), $.object_reference),
      seq($.keyword_catalog, optional($.keyword_extended), field('name', $.identifier)),
      seq($.keyword_function, optional($.keyword_extended), $.object_reference),
      seq($.keyword_model, optional($.keyword_extended), $.object_reference),
      seq($.keyword_connection, optional($.keyword_extended), $.object_reference),
      seq($.keyword_job, alias($._literal_string, $.literal)),
    ),
  ),

};
