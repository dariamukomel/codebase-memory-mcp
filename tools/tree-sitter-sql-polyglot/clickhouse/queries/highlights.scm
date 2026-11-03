; inherits: sql

; ClickHouse dialect keyword highlights
(keyword_alias) @keyword
(keyword_attach) @keyword
(keyword_cache) @keyword
(keyword_cluster) @keyword
(keyword_codec) @keyword
(keyword_config) @keyword
(keyword_date32) @keyword
(keyword_datetime) @keyword
(keyword_datetime64) @keyword
(keyword_deduplicate) @keyword
(keyword_detach) @keyword
(keyword_dictionaries) @keyword
(keyword_dictionary) @keyword
(keyword_disk) @keyword
(keyword_distributed) @keyword
(keyword_dns) @keyword
(keyword_engine) @keyword
(keyword_ephemeral) @keyword
(keyword_fetches) @keyword
(keyword_fill) @keyword
(keyword_final) @keyword
(keyword_fixedstring) @keyword
(keyword_float32) @keyword
(keyword_float64) @keyword
(keyword_flush) @keyword
(keyword_format) @keyword
(keyword_freeze) @keyword
(keyword_show) @keyword
(keyword_databases) @keyword
(keyword_processlist) @keyword
(keyword_granularity) @keyword
(keyword_materialize) @keyword
(keyword_clear) @keyword
(keyword_int128) @keyword
(keyword_int16) @keyword
(keyword_int256) @keyword
(keyword_int32) @keyword
(keyword_int64) @keyword
(keyword_int8) @keyword
(keyword_ipv4) @keyword
(keyword_ipv6) @keyword
(keyword_layout) @keyword
(keyword_lifetime) @keyword
(keyword_live) @keyword
(keyword_logs) @keyword
(keyword_lowcardinality) @keyword
(keyword_map) @keyword
(keyword_max) @keyword
(keyword_merges) @keyword
(keyword_min) @keyword
(keyword_nested) @keyword
(keyword_nullable) @keyword
(keyword_optimize) @keyword
(keyword_outfile) @keyword
(keyword_populate) @keyword
(keyword_prewhere) @keyword
(keyword_qualify) @keyword
(keyword_reload) @keyword
(keyword_replica) @keyword
(keyword_replicated) @keyword
(keyword_sample) @keyword
(keyword_sends) @keyword
(keyword_settings) @keyword
(keyword_setting) @keyword
(keyword_ilike) @keyword
(keyword_source) @keyword
(keyword_start) @keyword
(keyword_step) @keyword
(keyword_stop) @keyword
(keyword_sync) @keyword
(keyword_system) @keyword
(keyword_totals) @keyword
(keyword_ttl) @keyword
(keyword_tuple) @keyword
(keyword_uint128) @keyword
(keyword_uint16) @keyword
(keyword_uint256) @keyword
(keyword_uint32) @keyword
(keyword_uint64) @keyword
(keyword_uint8) @keyword
(keyword_uuid) @keyword
(keyword_volume) @keyword

; ClickHouse BACKUP / RESTORE (#98)
[
  (keyword_backup)
  (keyword_restore)
] @keyword

; EXCHANGE TABLES and FREEZE/UNFREEZE (#110)
[
  (keyword_exchange)
  (keyword_unfreeze)
  (keyword_name)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining clickhouse keywords
; ============================================================

[
  (keyword_apply)
  (keyword_async)
  (keyword_catalog)
  (keyword_changeable_in_readonly)
  (keyword_cleanup)
  (keyword_collection)
  (keyword_const)
  (keyword_describe)
  (keyword_dry)
  (keyword_global)
  (keyword_hash)
  (keyword_host)
  (keyword_identified)
  (keyword_include)
  (keyword_ip)
  (keyword_keyed)
  (keyword_kill)
  (keyword_masking)
  (keyword_move)
  (keyword_mutation)
  (keyword_named)
  (keyword_overridable)
  (keyword_part)
  (keyword_parts)
  (keyword_permissive)
  (keyword_policy)
  (keyword_profile)
  (keyword_query)
  (keyword_quota)
  (keyword_readonly)
  (keyword_restrictive)
  (keyword_returning)
  (keyword_run)
  (keyword_test)
  (keyword_undrop)
  (keyword_use)
  (keyword_writable)
] @keyword

; Keywords that moved out of the ISO base grammar into the rules of this dialect
[
  (keyword_change)
  (keyword_collate)
  (keyword_concurrently)
  (keyword_connection)
  (keyword_deferrable)
  (keyword_disable)
  (keyword_enable)
  (keyword_encrypted)
  (keyword_force)
  (keyword_initially)
  (keyword_logged)
  (keyword_modify)
  (keyword_none)
  (keyword_nowait)
  (keyword_owned)
  (keyword_owner)
  (keyword_password)
  (keyword_refresh)
  (keyword_rename)
  (keyword_reset)
  (keyword_tables)
  (keyword_tablespace)
  (keyword_temp)
  (keyword_unlogged)
  (keyword_until)
  (keyword_valid)
  (keyword_value)
  (keyword_wait)
] @keyword
