export default {

  // DESCRIBE [EXTENDED] table [PARTITION (spec)]
  describe_table: $ => seq(
    $.keyword_describe,
    optional($.keyword_extended),
    $.object_reference,
    optional($._partition_spec),
  ),

  // DESCRIBE HISTORY table [LIMIT n]
  describe_history: $ => seq(
    $.keyword_describe,
    $.keyword_history,
    $.object_reference,
    optional(seq($.keyword_limit, $.literal)),
  ),

  // DESCRIBE DETAIL table
  describe_detail: $ => seq(
    $.keyword_describe,
    $.keyword_detail,
    $.object_reference,
  ),

  // DESCRIBE CATALOG / CONNECTION / CREDENTIAL / EXTERNAL LOCATION / VOLUME name
  describe_uc_object: $ => seq(
    $.keyword_describe,
    choice(
      $.keyword_catalog,
      $.keyword_connection,
      $.keyword_credential,
      seq($.keyword_external, $.keyword_location),
      $.keyword_volume,
    ),
    $.object_reference,
  ),

  // DESCRIBE QUERY moved to spark/grammar/cache.js; it is an OSS Spark
  // statement, so Databricks now inherits it rather than owning it.

};
