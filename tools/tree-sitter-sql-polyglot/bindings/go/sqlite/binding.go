package sqlite

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../sqlite/src/parser.c"
// #include "../../../sqlite/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the sqlite_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_sqlite_sql())
}
