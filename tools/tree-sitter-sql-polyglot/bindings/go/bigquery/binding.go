package bigquery

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../bigquery/src/parser.c"
// #include "../../../bigquery/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the bigquery_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_bigquery_sql())
}
