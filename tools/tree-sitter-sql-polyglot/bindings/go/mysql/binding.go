package mysql

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../mysql/src/parser.c"
// #include "../../../mysql/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the mysql_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_mysql_sql())
}
