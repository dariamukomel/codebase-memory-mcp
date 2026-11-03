package cockroachdb

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../cockroachdb/src/parser.c"
// #include "../../../cockroachdb/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the cockroachdb_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_cockroachdb_sql())
}
