package trino

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../trino/src/parser.c"
// #include "../../../trino/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the trino_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_trino_sql())
}
