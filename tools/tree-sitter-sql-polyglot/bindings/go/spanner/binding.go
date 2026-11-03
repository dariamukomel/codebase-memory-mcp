package spanner

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../spanner/src/parser.c"
// #include "../../../spanner/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the spanner_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_spanner_sql())
}
