package tsql

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../tsql/src/parser.c"
// #include "../../../tsql/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the tsql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_tsql())
}
