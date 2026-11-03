; inherits: trino_sql

; Athena-specific keywords
[
  (keyword_unload)
  (keyword_msck)
  (keyword_repair)
  (keyword_sync)
  (keyword_partitions)
  (keyword_partitioned)
  (keyword_location)
  (keyword_serde)
  (keyword_serdeproperties)
  (keyword_stored)
  (keyword_tblproperties)
  (keyword_textfile)
  (keyword_parquet)
  (keyword_orc)
  (keyword_avro)
  (keyword_rcfile)
  (keyword_sequencefile)
  (keyword_inputformat)
  (keyword_delimited)
  (keyword_terminated)
  (keyword_fields)
  (keyword_lines)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining athena keywords
; ============================================================

[
  (keyword_bin_pack)
  (keyword_databases)
  (keyword_dbproperties)
  (keyword_dialect)
  (keyword_optimize)
  (keyword_rewrite)
  (keyword_vacuum)
  (keyword_views)
] @keyword
