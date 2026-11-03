; inherits: mysql

; MariaDB system-versioning / temporal keywords
[
  (keyword_system)
  (keyword_versioning)
  (keyword_period)
] @keyword

; MariaDB package keywords
[
  (keyword_package)
  (keyword_body)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining mariadb keywords
; ============================================================

[
  (keyword_returning)
  (keyword_system_time)
] @keyword
