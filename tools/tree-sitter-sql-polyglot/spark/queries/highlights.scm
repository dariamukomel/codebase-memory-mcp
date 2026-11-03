; inherits: hive

; Spark/Hive/Iceberg-specific keywords
[
  (keyword_optimize)
  (keyword_zorder)
  (keyword_rewrite)
  (keyword_location)
  (keyword_bucket)
] @keyword

[
  (keyword_bin_pack)
] @type.qualifier

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; Spark cache / resource management keywords
[
  (keyword_lazy)
  (keyword_clear)
  (keyword_uncache)
  (keyword_file)
  (keyword_files)
  (keyword_jars)
  (keyword_archive)
  (keyword_archives)
  (keyword_list)
] @keyword

; Spark SHOW / DESCRIBE / SET PATH keywords
[
  (keyword_views)
  (keyword_collations)
  (keyword_query)
  (keyword_path)
  (keyword_default_path)
  (keyword_system_path)
  (keyword_current_schema)
  (keyword_current_database)
] @keyword

; Spark 4.2 geospatial types
[
  (keyword_geometry)
  (keyword_geography)
] @type.builtin

; ============================================================
; Remaining spark keywords
; ============================================================

[
  (keyword_call)
  (keyword_clone)
  (keyword_compute)
  (keyword_condition)
  (keyword_deep)
  (keyword_delta)
  (keyword_diagnostics)
  (keyword_distributed)
  (keyword_field)
  (keyword_get)
  (keyword_include)
  (keyword_incremental)
  (keyword_iterate)
  (keyword_leave)
  (keyword_loop)
  (keyword_message_text)
  (keyword_metadata)
  (keyword_name)
  (keyword_noscan)
  (keyword_options)
  (keyword_ordered)
  (keyword_pivot)
  (keyword_properties)
  (keyword_purge)
  (keyword_qualify)
  (keyword_repeat)
  (keyword_resignal)
  (keyword_returned_sqlstate)
  (keyword_shallow)
  (keyword_signal)
  (keyword_source)
  (keyword_sqlstate)
  (keyword_statistics)
  (keyword_stats)
  (keyword_unpivot)
  (keyword_var)
  (keyword_variable)
  (keyword_version)
  (keyword_while)
] @keyword

[
  (keyword_elseif)
] @conditional

[
  (keyword_variant)
] @type.builtin
(keyword_percent) @keyword
(keyword_snapshot) @keyword
