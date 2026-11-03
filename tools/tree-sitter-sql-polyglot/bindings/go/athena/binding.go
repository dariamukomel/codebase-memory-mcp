package athena

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../athena/src/parser.c"
// #include "../../../athena/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the athena_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_athena_sql())
}
