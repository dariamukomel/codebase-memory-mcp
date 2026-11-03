; inherits: sql

; DuckDB-specific keywords
[
  (keyword_prepare)
  (keyword_deallocate)
  (keyword_show)
  (keyword_databases)
  (keyword_attach)
  (keyword_detach)
  (keyword_install)
  (keyword_summarize)
  (keyword_asof)
  (keyword_positional)
  (keyword_map)
  (keyword_struct)
  (keyword_qualify)
  (keyword_load)
] @keyword

; DuckDB native types
[
  (keyword_hugeint)
  (keyword_uinteger)
  (keyword_ubigint)
  (keyword_usmallint)
  (keyword_utinyint)
  (keyword_tinyint)
  (keyword_blob)
  (keyword_uuid)
  (keyword_varint)
] @type.builtin

; Lambda expression arrow
(lambda_expression "->" @operator)

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining duckdb keywords
; ============================================================

[
  (keyword_call)
  (keyword_catalog)
  (keyword_checkpoint)
  (keyword_conflict)
  (keyword_copy)
  (keyword_describe)
  (keyword_do)
  (keyword_export)
  (keyword_extension)
  (keyword_global)
  (keyword_hash)
  (keyword_ignore)
  (keyword_import)
  (keyword_include)
  (keyword_macro)
  (keyword_name)
  (keyword_nothing)
  (keyword_persistent)
  (keyword_pivot)
  (keyword_returning)
  (keyword_sample)
  (keyword_secret)
  (keyword_unpivot)
  (keyword_use)
  (keyword_vacuum)
  (keyword_variable)
] @keyword

[
  (keyword_read_avro)
  (keyword_read_csv)
  (keyword_read_csv_auto)
  (keyword_read_json)
  (keyword_read_json_auto)
  (keyword_read_orc)
  (keyword_read_parquet)
] @function.builtin

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
  (keyword_tables)
  (keyword_tablespace)
  (keyword_temp)
  (keyword_unlogged)
  (keyword_until)
  (keyword_valid)
  (keyword_value)
  (keyword_wait)
] @keyword
(keyword_percent) @keyword
