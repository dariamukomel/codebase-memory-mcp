package mysql_test

import (
	"testing"

	mysql "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/mysql"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(mysql.Language())
	if language == nil {
		t.Errorf("Error loading mysql_sql grammar")
	}
}
