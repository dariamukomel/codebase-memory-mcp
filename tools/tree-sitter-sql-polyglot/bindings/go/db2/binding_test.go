package db2_test

import (
	"testing"

	db2 "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/db2"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(db2.Language())
	if language == nil {
		t.Errorf("Error loading db2_sql grammar")
	}
}
