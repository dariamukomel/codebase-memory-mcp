package redshift

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../redshift/src/parser.c"
// #include "../../../redshift/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the redshift_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_redshift_sql())
}
