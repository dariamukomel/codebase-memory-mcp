package oracle

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../oracle/src/parser.c"
// #include "../../../oracle/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the oracle_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_oracle_sql())
}
