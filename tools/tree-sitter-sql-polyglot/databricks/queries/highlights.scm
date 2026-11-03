; inherits: spark_sql

; Databricks/Unity Catalog keywords
(keyword_vacuum) @keyword
(keyword_restore) @keyword
(keyword_convert) @keyword
(keyword_delta) @keyword
(keyword_fsck) @keyword
(keyword_repair) @keyword
(keyword_reorg) @keyword
(keyword_generate) @keyword
(keyword_msck) @keyword
(keyword_grant) @keyword
(keyword_revoke) @keyword
(keyword_deny) @keyword
(keyword_catalog) @keyword
(keyword_namespace) @keyword
(keyword_volume) @keyword
(keyword_credential) @keyword
(keyword_connection) @keyword
(keyword_recipient) @keyword
(keyword_provider) @keyword
(keyword_share) @keyword
(keyword_metastore) @keyword
(keyword_principal) @keyword
(keyword_privileges) @keyword
(keyword_purge) @keyword
(keyword_retain) @keyword
(keyword_hours) @keyword
(keyword_dry) @keyword
(keyword_run) @keyword
(keyword_uncache) @keyword
(keyword_lazy) @keyword
(keyword_history) @keyword
(keyword_detail) @keyword
(keyword_noscan) @keyword
; override: base classifies as @type.qualifier; COMPUTE STATISTICS is a Databricks verb
(keyword_statistics) @keyword
(keyword_compute) @keyword
(keyword_jars) @keyword
(keyword_archive) @keyword
(keyword_archives) @keyword
(keyword_files) @keyword
(keyword_catalogs) @keyword
(keyword_namespaces) @keyword
(keyword_volumes) @keyword
(keyword_grants) @keyword
(keyword_connections) @keyword
(keyword_credentials) @keyword
(keyword_shares) @keyword
(keyword_recipients) @keyword
(keyword_providers) @keyword
(keyword_tblproperties) @keyword
(keyword_partitions) @keyword
(keyword_streaming) @keyword
(keyword_live) @keyword
(keyword_policy) @keyword
(keyword_cluster) @keyword
(keyword_options) @keyword
(keyword_url) @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; Previously missing Databricks statement keywords
[
  (keyword_undrop)
  (keyword_id)
  (keyword_server)
  (keyword_bloomfilter)
  (keyword_users)
  (keyword_policies)
  (keyword_locations)
  (keyword_procedures)
  (keyword_dropped)
] @keyword

; ============================================================
; Remaining databricks keywords
; ============================================================

[
  (keyword_appends)
  (keyword_apply)
  (keyword_at)
  (keyword_branch)
  (keyword_changes)
  (keyword_copy)
  (keyword_copy_options)
  (keyword_cron)
  (keyword_every)
  (keyword_fileformat)
  (keyword_flow)
  (keyword_format_options)
  (keyword_global)
  (keyword_keys)
  (keyword_pattern)
  (keyword_position)
  (keyword_schedule)
  (keyword_service)
  (keyword_tag)
  (keyword_unload)
  (keyword_upsert)
  (keyword_validate)
] @keyword
