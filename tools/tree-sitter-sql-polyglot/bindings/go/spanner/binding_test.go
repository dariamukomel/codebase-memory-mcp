package spanner_test

import (
	"testing"

	spanner "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/spanner"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(spanner.Language())
	if language == nil {
		t.Errorf("Error loading spanner_sql grammar")
	}
}
