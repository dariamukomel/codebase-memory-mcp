package sqlite_test

import (
	"testing"

	sqlite "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/sqlite"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(sqlite.Language())
	if language == nil {
		t.Errorf("Error loading sqlite_sql grammar")
	}
}
