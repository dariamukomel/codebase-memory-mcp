package clickhouse_test

import (
	"testing"

	clickhouse "github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/clickhouse"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(clickhouse.Language())
	if language == nil {
		t.Errorf("Error loading clickhouse_sql grammar")
	}
}
