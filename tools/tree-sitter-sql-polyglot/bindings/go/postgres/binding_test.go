package postgres_test

import (
	"testing"

	postgres "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/postgres"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(postgres.Language())
	if language == nil {
		t.Errorf("Error loading postgres_sql grammar")
	}
}
