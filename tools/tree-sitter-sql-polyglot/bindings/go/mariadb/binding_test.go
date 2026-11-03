package mariadb_test

import (
	"testing"

	mariadb "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/mariadb"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(mariadb.Language())
	if language == nil {
		t.Errorf("Error loading mariadb_sql grammar")
	}
}
