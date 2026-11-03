package trino_test

import (
	"testing"

	trino "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/trino"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(trino.Language())
	if language == nil {
		t.Errorf("Error loading trino_sql grammar")
	}
}
