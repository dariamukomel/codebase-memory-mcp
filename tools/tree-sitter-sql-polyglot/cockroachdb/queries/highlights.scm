; inherits: postgres_sql

; CockroachDB-specific keywords
[
  (keyword_backup)
  (keyword_restore)
  (keyword_import)
  (keyword_changefeed)
  (keyword_upsert)
  (keyword_latest)
  (keyword_csv)
  (keyword_system)
  (keyword_jobs)
  (keyword_users)
  (keyword_databases)
  (keyword_grants)
  (keyword_columns)
  (keyword_storing)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining cockroachdb keywords
; ============================================================

[
  (keyword_at)
  (keyword_availability)
  (keyword_cancel)
  (keyword_configuration)
  (keyword_configure)
  (keyword_convert)
  (keyword_expiration)
  (keyword_export)
  (keyword_failure)
  (keyword_family)
  (keyword_global)
  (keyword_job)
  (keyword_locality)
  (keyword_parent)
  (keyword_pause)
  (keyword_placement)
  (keyword_queries)
  (keyword_query)
  (keyword_region)
  (keyword_regional)
  (keyword_regions)
  (keyword_resume)
  (keyword_scatter)
  (keyword_schedule)
  (keyword_schedules)
  (keyword_sessions)
  (keyword_setting)
  (keyword_split)
  (keyword_survive)
  (keyword_unsplit)
] @keyword
