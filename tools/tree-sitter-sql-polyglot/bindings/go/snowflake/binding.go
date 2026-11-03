package snowflake

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../snowflake/src/parser.c"
// #include "../../../snowflake/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the snowflake_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_snowflake_sql())
}
