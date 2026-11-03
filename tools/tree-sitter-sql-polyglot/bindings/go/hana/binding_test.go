package hana_test

import (
	"testing"

	hana "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/hana"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(hana.Language())
	if language == nil {
		t.Errorf("Error loading hana_sql grammar")
	}
}
