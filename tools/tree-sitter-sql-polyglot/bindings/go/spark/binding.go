package spark

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../spark/src/parser.c"
// #include "../../../spark/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the spark_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_spark_sql())
}
