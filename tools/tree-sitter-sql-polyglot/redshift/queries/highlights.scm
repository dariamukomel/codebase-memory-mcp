; inherits: sql

; Redshift-specific keywords
(keyword_prepare) @keyword
(keyword_deallocate) @keyword
(keyword_copy) @keyword
(keyword_unload) @keyword
(keyword_iam_role) @keyword
(keyword_postgres) @keyword
(keyword_mysql) @keyword
(keyword_kinesis) @keyword
(keyword_msk) @keyword
(keyword_redshift) @keyword
(keyword_uri) @keyword
(keyword_port) @keyword
(keyword_secret_arn) @keyword
(keyword_properties) @keyword
(keyword_ignoreheader) @keyword
(keyword_maxfilesize) @keyword
(keyword_gzip) @keyword
(keyword_bzip2) @keyword
(keyword_lzop) @keyword
(keyword_zstd) @keyword
(keyword_format) @keyword
(keyword_csv) @keyword
(keyword_delimiter) @keyword
(keyword_quote) @keyword
(keyword_parquet) @keyword
(keyword_orc) @keyword
(keyword_avro) @keyword
(keyword_rcfile) @keyword
(keyword_compression) @keyword
(keyword_vacuum) @keyword
(keyword_reindex) @keyword
(keyword_sort) @keyword
(keyword_distkey) @keyword
(keyword_sortkey) @keyword
(keyword_diststyle) @keyword
(keyword_encode) @keyword
(keyword_compound) @keyword
(keyword_interleaved) @keyword
(keyword_even) @keyword
(keyword_auto) @keyword
(keyword_stored) @keyword
(keyword_location) @keyword
(keyword_approximate) @keyword

; Bulk GRANT keywords (#87)
[
  (keyword_sequences)
  (keyword_functions)
  (keyword_procedures)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining redshift keywords
; ============================================================

[
  (keyword_abort)
  (keyword_access)
  (keyword_account)
  (keyword_append)
  (keyword_attach)
  (keyword_backup)
  (keyword_call)
  (keyword_cancel)
  (keyword_catalog)
  (keyword_close)
  (keyword_columns)
  (keyword_conjunction)
  (keyword_databases)
  (keyword_datashare)
  (keyword_datashares)
  (keyword_definition)
  (keyword_delimited)
  (keyword_detach)
  (keyword_exported)
  (keyword_extension)
  (keyword_fields)
  (keyword_forward)
  (keyword_grants)
  (keyword_identity)
  (keyword_inerror)
  (keyword_integration)
  (keyword_keys)
  (keyword_lambda)
  (keyword_library)
  (keyword_lock)
  (keyword_masking)
  (keyword_model)
  (keyword_namespace)
  (keyword_nocreatedb)
  (keyword_nocreateuser)
  (keyword_off)
  (keyword_parameters)
  (keyword_partitioned)
  (keyword_policies)
  (keyword_policy)
  (keyword_predicate)
  (keyword_priority)
  (keyword_provider)
  (keyword_remove)
  (keyword_rls)
  (keyword_schemas)
  (keyword_settings)
  (keyword_show)
  (keyword_syslog)
  (keyword_target)
  (keyword_template)
  (keyword_templates)
  (keyword_terminated)
  (keyword_timeout)
  (keyword_unlimited)
  (keyword_unrestricted)
  (keyword_yes)
] @keyword

; Keywords that moved out of the ISO base grammar into the rules of this dialect
[
  (keyword_cache)
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
  (keyword_snapshot)
  (keyword_tables)
  (keyword_tablespace)
  (keyword_temp)
  (keyword_unlogged)
  (keyword_until)
  (keyword_valid)
  (keyword_value)
  (keyword_wait)
] @keyword
