package snowflake_test

import (
	"testing"

	snowflake "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/snowflake"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(snowflake.Language())
	if language == nil {
		t.Errorf("Error loading snowflake_sql grammar")
	}
}
