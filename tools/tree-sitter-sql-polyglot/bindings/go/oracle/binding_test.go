package oracle_test

import (
	"testing"

	oracle "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/oracle"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(oracle.Language())
	if language == nil {
		t.Errorf("Error loading oracle_sql grammar")
	}
}
