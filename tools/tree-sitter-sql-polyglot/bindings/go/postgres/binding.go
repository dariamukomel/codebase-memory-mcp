package postgres

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../postgres/src/parser.c"
// #include "../../../postgres/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the postgres_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_postgres_sql())
}
