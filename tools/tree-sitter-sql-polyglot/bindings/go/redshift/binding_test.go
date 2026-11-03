package redshift_test

import (
	"testing"

	redshift "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/redshift"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(redshift.Language())
	if language == nil {
		t.Errorf("Error loading redshift_sql grammar")
	}
}
