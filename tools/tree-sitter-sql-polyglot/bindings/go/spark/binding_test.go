package spark_test

import (
	"testing"

	spark "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/spark"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(spark.Language())
	if language == nil {
		t.Errorf("Error loading spark_sql grammar")
	}
}
