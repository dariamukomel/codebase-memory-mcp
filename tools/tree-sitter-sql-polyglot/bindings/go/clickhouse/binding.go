package clickhouse

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../clickhouse/src/parser.c"
// #include "../../../clickhouse/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the clickhouse_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_clickhouse_sql())
}
