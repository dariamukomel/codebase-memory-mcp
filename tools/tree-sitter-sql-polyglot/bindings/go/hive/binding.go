package hive

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../hive/src/parser.c"
// #include "../../../hive/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the hive_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_hive_sql())
}
