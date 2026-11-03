; inherits: sql

; Postgres-specific index type keywords
[
  (keyword_btree)
  (keyword_gist)
  (keyword_spgist)
  (keyword_gin)
  (keyword_brin)
] @function.call

; PostgreSQL partitioning keywords
[
  (keyword_inherits)
  (keyword_including)
  (keyword_excluding)
] @keyword

; PostgreSQL maintenance / utility statement keywords
[
  (keyword_reindex)
  (keyword_cluster)
  (keyword_checkpoint)
  (keyword_discard)
  (keyword_plans)
  (keyword_sequences)
  (keyword_load)
  (keyword_close)
  (keyword_abort)
  (keyword_chain)
  (keyword_move)
  (keyword_prior)
  (keyword_absolute)
  (keyword_relative)
  (keyword_forward)
  (keyword_backward)
] @keyword

; PostgreSQL object-definition statement keywords
[
  (keyword_label)
  (keyword_reassign)
  (keyword_import)
  (keyword_collation)
  (keyword_conversion)
  (keyword_method)
  (keyword_handler)
  (keyword_transform)
  (keyword_sql)
  (keyword_event)
  (keyword_procedural)
  (keyword_large)
  (keyword_object)
  (keyword_routine)
  (keyword_operator)
  (keyword_rule)
  (keyword_also)
  (keyword_replica)
] @keyword

; User-defined operator symbols (CREATE/ALTER OPERATOR)
(operator_symbol) @operator

; PostgreSQL replication / CTE / DO keywords (#31)
[
  (keyword_publication)
  (keyword_subscription)
  (keyword_search)
  (keyword_breadth)
  (keyword_depth)
] @keyword

; PostgreSQL LISTEN/NOTIFY/UNLISTEN
[
  (keyword_listen)
  (keyword_notify)
  (keyword_unlisten)
] @keyword

; PostgreSQL locking, prepared statements, CALL, EXPLAIN options, bulk GRANT (#86–#92)
[
  (keyword_share)
  (keyword_lock)
  (keyword_locked)
  (keyword_skip)
  (keyword_mode)
  (keyword_access)
  (keyword_exclusive)
  (keyword_prepare)
  (keyword_deallocate)
  (keyword_call)
  (keyword_costs)
  (keyword_settings)
  (keyword_generic_plan)
  (keyword_buffers)
  (keyword_wal)
  (keyword_timing)
  (keyword_summary)
  (keyword_yaml)
  (keyword_sequences)
  (keyword_functions)
  (keyword_procedures)
  (keyword_routines)
  (keyword_ilike)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining postgres keywords
; ============================================================

[
  (keyword_aggregate)
  (keyword_assignment)
  (keyword_attach)
  (keyword_comments)
  (keyword_compression)
  (keyword_conflict)
  (keyword_copy)
  (keyword_csv)
  (keyword_defaults)
  (keyword_delimiter)
  (keyword_depends)
  (keyword_do)
  (keyword_domain)
  (keyword_encoding)
  (keyword_extended)
  (keyword_extension)
  (keyword_force_not_null)
  (keyword_force_null)
  (keyword_force_quote)
  (keyword_format)
  (keyword_freeze)
  (keyword_hash)
  (keyword_header)
  (keyword_hold)
  (keyword_identity)
  (keyword_implicit)
  (keyword_include)
  (keyword_indexes)
  (keyword_list)
  (keyword_main)
  (keyword_match)
  (keyword_modulus)
  (keyword_nothing)
  (keyword_object_id)
  (keyword_off)
  (keyword_options)
  (keyword_permissive)
  (keyword_plain)
  (keyword_policy)
  (keyword_program)
  (keyword_quote)
  (keyword_remainder)
  (keyword_restrictive)
  (keyword_returning)
  (keyword_server)
  (keyword_show)
  (keyword_statistics)
  (keyword_stdin)
  (keyword_stdout)
  (keyword_storage)
  (keyword_text)
  (keyword_vacuum)
  (keyword_version)
  (keyword_wrapper)
] @keyword

[
  (keyword_current_role)
  (keyword_current_user)
  (keyword_session_user)
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
