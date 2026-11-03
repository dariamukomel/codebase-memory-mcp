package hana

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../hana/src/parser.c"
// #include "../../../hana/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the hana_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_hana_sql())
}
