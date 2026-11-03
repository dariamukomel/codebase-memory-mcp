package athena_test

import (
	"testing"

	athena "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/athena"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(athena.Language())
	if language == nil {
		t.Errorf("Error loading athena_sql grammar")
	}
}
