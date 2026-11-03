package cockroachdb_test

import (
	"testing"

	cockroachdb "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/cockroachdb"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(cockroachdb.Language())
	if language == nil {
		t.Errorf("Error loading cockroachdb_sql grammar")
	}
}
