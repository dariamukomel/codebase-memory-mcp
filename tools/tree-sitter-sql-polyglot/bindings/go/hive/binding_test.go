package hive_test

import (
	"testing"

	hive "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/hive"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(hive.Language())
	if language == nil {
		t.Errorf("Error loading hive_sql grammar")
	}
}
