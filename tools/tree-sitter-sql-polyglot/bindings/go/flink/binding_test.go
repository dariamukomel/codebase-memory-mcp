package flink_test

import (
	"testing"

	flink "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/flink"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(flink.Language())
	if language == nil {
		t.Errorf("Error loading flink_sql grammar")
	}
}
