package teradata

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../teradata/src/parser.c"
// #include "../../../teradata/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the teradata_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_teradata_sql())
}
