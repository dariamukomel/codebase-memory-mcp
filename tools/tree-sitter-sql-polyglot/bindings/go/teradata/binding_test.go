package teradata_test

import (
	"testing"

	teradata "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/teradata"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(teradata.Language())
	if language == nil {
		t.Errorf("Error loading teradata_sql grammar")
	}
}
