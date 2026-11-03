package bigquery_test

import (
	"testing"

	bigquery "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/bigquery"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(bigquery.Language())
	if language == nil {
		t.Errorf("Error loading bigquery_sql grammar")
	}
}
