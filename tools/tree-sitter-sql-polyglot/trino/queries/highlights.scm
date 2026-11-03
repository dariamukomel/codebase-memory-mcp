; inherits: sql

; Trino-specific keywords
[
  (keyword_prepare)
  (keyword_deallocate)
  (keyword_stats)
  (keyword_match_recognize)
  (keyword_measures)
  (keyword_pattern)
  (keyword_define)
  (keyword_running)
  (keyword_final)
  (keyword_skip)
  (keyword_past)
  (keyword_map)
  (keyword_one)
  (keyword_per)
  (keyword_logical)
  (keyword_distributed)
  (keyword_validate)
  (keyword_io)
  (keyword_graphviz)
  (keyword_format)
  (keyword_bernoulli)
  (keyword_system)
  (keyword_call)
  (keyword_output)
  (keyword_branch)
  (keyword_branches)
  (keyword_catalog)
  (keyword_fast)
  (keyword_forward)
] @keyword

; Trino native types
[
  (keyword_tinyint)
  (keyword_ipaddress)
  (keyword_uuid)
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
; Remaining trino keywords
; ============================================================

[
  (keyword_catalogs)
  (keyword_columns)
  (keyword_deny)
  (keyword_describe)
  (keyword_extended)
  (keyword_functions)
  (keyword_grants)
  (keyword_match)
  (keyword_path)
  (keyword_properties)
  (keyword_roles)
  (keyword_schemas)
  (keyword_show)
  (keyword_text)
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
  (keyword_tables)
  (keyword_tablespace)
  (keyword_temp)
  (keyword_unlogged)
  (keyword_until)
  (keyword_valid)
  (keyword_value)
  (keyword_wait)
] @keyword
