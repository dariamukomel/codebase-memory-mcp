; inherits: sql

; SQLite-specific keywords
[
  (keyword_pragma)
  (keyword_attach)
  (keyword_detach)
  (keyword_rowid)
  (keyword_reindex)
  (keyword_abort)
  (keyword_fail)
  (keyword_indexed)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining sqlite keywords
; ============================================================

[
  (keyword_autoincrement)
  (keyword_conflict)
  (keyword_do)
  (keyword_exclusive)
  (keyword_glob)
  (keyword_hash)
  (keyword_ignore)
  (keyword_include)
  (keyword_match)
  (keyword_nothing)
  (keyword_returning)
  (keyword_stored)
  (keyword_vacuum)
  (keyword_virtual)
] @keyword

; Keywords that moved out of the ISO base grammar into the rules of this dialect
[
  (keyword_cache)
  (keyword_change)
  (keyword_collate)
  (keyword_concurrently)
  (keyword_connection)
  (keyword_disable)
  (keyword_enable)
  (keyword_encrypted)
  (keyword_force)
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
