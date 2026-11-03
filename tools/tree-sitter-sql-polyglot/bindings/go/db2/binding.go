package db2

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../db2/src/parser.c"
// #include "../../../db2/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the db2_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_db2_sql())
}
