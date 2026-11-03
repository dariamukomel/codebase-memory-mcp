; inherits: bigquery_sql

; Spanner-specific keywords
[
  (keyword_interleave)
  (keyword_parent)
  (keyword_null_filtered)
  (keyword_storing)
  (keyword_stream)
  (keyword_deletion)
  (keyword_policy)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining spanner keywords
; ============================================================

[
  (keyword_auto_increment)
  (keyword_bit_reversed_positive)
  (keyword_bundle)
  (keyword_counter)
  (keyword_hidden)
  (keyword_identity)
  (keyword_ignore)
  (keyword_locality)
  (keyword_max)
  (keyword_older_than)
  (keyword_output)
  (keyword_placement)
  (keyword_proto)
  (keyword_remote)
  (keyword_skip)
  (keyword_sql)
  (keyword_statistics)
  (keyword_reservoir)
  (keyword_stored)
  (keyword_synonym)
] @keyword
