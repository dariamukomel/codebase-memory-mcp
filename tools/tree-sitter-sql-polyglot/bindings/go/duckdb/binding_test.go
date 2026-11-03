package duckdb_test

import (
	"testing"

	duckdb "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/duckdb"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(duckdb.Language())
	if language == nil {
		t.Errorf("Error loading duckdb_sql grammar")
	}
}
