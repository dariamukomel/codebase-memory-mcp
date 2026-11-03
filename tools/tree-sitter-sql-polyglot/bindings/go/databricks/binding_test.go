package databricks_test

import (
	"testing"

	databricks "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/databricks"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(databricks.Language())
	if language == nil {
		t.Errorf("Error loading databricks_sql grammar")
	}
}
