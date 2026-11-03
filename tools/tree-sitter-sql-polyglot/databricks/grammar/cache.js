// Databricks refresh statements.
//
// CACHE / UNCACHE / CLEAR CACHE moved up to spark/grammar/cache.js; they are
// OSS Spark statements, so Databricks now inherits them rather than owning
// them. Only the Databricks-specific refresh forms remain here.
export default {

  // REFRESH TABLE name
  refresh_table_databricks: $ => seq(
    $.keyword_refresh,
    $.keyword_table,
    $.object_reference,
  ),

  // REFRESH FUNCTION name
  refresh_function: $ => seq(
    $.keyword_refresh,
    $.keyword_function,
    $.object_reference,
  ),

};
