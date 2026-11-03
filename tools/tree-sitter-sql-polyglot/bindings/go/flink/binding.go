package flink

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../flink/src/parser.c"
// #include "../../../flink/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the flink_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_flink_sql())
}
