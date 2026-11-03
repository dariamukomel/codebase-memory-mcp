; inherits: sql

; BigQuery-specific keywords
[
  (keyword_int64)
  (keyword_float64)
  (keyword_bytes)
  (keyword_bignumeric)
  (keyword_geography)
  (keyword_datetime)
] @type.builtin

(keyword_unnest) @function.call

; Search / vector index DDL
[
  (keyword_search)
  (keyword_vector)
  (keyword_columns)
] @keyword

(keyword_struct) @keyword
(keyword_export) @keyword
(keyword_model) @keyword
(keyword_assert) @keyword
(keyword_continue) @keyword
(keyword_ml) @keyword
(keyword_predict) @keyword
(keyword_evaluate) @keyword
(keyword_error) @keyword
; MERGE WHEN NOT MATCHED BY SOURCE (moved from base; BQ/SQL Server extension)
(keyword_source) @keyword

; BigQuery scripting CALL/RAISE/RETURN (#95)
[
  (keyword_call)
  (keyword_raise)
  (keyword_message)
  (keyword_return)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining bigquery keywords
; ============================================================

[
  (keyword_access)
  (keyword_aggregate)
  (keyword_assignment)
  (keyword_bi_capacity)
  (keyword_capacity)
  (keyword_clone)
  (keyword_cluster)
  (keyword_copy)
  (keyword_data_policy)
  (keyword_do)
  (keyword_enforced)
  (keyword_exception)
  (keyword_extension)
  (keyword_files)
  (keyword_hash)
  (keyword_include)
  (keyword_iterate)
  (keyword_leave)
  (keyword_load)
  (keyword_loop)
  (keyword_options)
  (keyword_organization)
  (keyword_overwrite)
  (keyword_pivot)
  (keyword_policies)
  (keyword_policy)
  (keyword_project)
  (keyword_qualify)
  (keyword_rebuild)
  (keyword_replica)
  (keyword_reservation)
  (keyword_system_time)
  (keyword_undrop)
  (keyword_unpivot)
  (keyword_while)
] @keyword

[
  (keyword_elseif)
] @conditional

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
(keyword_percent) @keyword
