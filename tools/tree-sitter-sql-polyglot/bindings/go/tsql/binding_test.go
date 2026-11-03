package tsql_test

import (
	"testing"

	tsql "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/tsql"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tsql.Language())
	if language == nil {
		t.Errorf("Error loading tsql grammar")
	}
}
