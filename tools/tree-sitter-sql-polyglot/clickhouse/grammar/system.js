export default {

  // SHOW {[ALL] TABLES [FROM db] [LIKE '…'] | DATABASES | CREATE TABLE obj | PROCESSLIST}
  show_statement: $ => prec.right(seq(
    $.keyword_show,
    choice(
      seq(
        optional($.keyword_all),
        $.keyword_tables,
        optional(seq($.keyword_from, $.object_reference)),
        optional(seq($.keyword_like, alias($._literal_string, $.literal))),
      ),
      $.keyword_databases,
      seq($.keyword_create, $.keyword_table, $.object_reference),
      $.keyword_processlist,
    ),
  )),

  // SYSTEM <command> [ON CLUSTER ...]
  system_statement: $ => seq(
    $.keyword_system,
    $._system_command,
    optional($.on_cluster),
  ),

  _system_command: $ => choice(
    // FLUSH LOGS | FLUSH DISTRIBUTED t
    seq($.keyword_flush, $.keyword_logs),
    seq($.keyword_flush, $.keyword_distributed, $.object_reference),
    // RELOAD DICTIONARIES | RELOAD DICTIONARY d | RELOAD CONFIG
    seq($.keyword_reload, $.keyword_dictionaries),
    seq($.keyword_reload, $.keyword_dictionary, $.object_reference),
    seq($.keyword_reload, $.keyword_config),
    // DROP DNS CACHE | DROP MARK CACHE | DROP UNCOMPRESSED CACHE
    seq($.keyword_drop, $.keyword_dns, $.keyword_cache),
    seq($.keyword_drop, $.identifier, $.keyword_cache),
    // {STOP|START} MERGES [t] | FETCHES [t] | TTL MERGES [t] | REPLICATED SENDS [t]
    seq(
      choice($.keyword_stop, $.keyword_start),
      choice(
        $.keyword_merges,
        $.keyword_fetches,
        seq($.keyword_ttl, $.keyword_merges),
        seq($.keyword_replicated, $.keyword_sends),
        seq($.keyword_distributed, $.keyword_sends),
      ),
      optional($.object_reference),
    ),
    // SYNC REPLICA t
    seq($.keyword_sync, $.keyword_replica, $.object_reference),
  ),

};
