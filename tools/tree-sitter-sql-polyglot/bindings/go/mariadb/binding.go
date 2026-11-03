package mariadb

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../mariadb/src/parser.c"
// #include "../../../mariadb/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the mariadb_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_mariadb_sql())
}
