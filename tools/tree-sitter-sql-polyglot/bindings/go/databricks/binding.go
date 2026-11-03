package databricks

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../databricks/src/parser.c"
// #include "../../../databricks/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the databricks_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_databricks_sql())
}
