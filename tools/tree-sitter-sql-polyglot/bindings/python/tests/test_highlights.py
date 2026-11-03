from unittest import TestCase

from tree_sitter import Language, Query
import tree_sitter_sql


class TestHighlightsQueries(TestCase):
    def test_base_highlights_query_compiles(self):
        Query(Language(tree_sitter_sql.language()), tree_sitter_sql.HIGHLIGHTS_QUERY)

    def test_every_dialect_highlights_query_compiles(self):
        dialects = [n[len("language_"):] for n in tree_sitter_sql.__all__ if n.startswith("language_")]
        self.assertEqual(len(dialects), 22)
        for dialect in dialects:
            with self.subTest(dialect=dialect):
                language = Language(getattr(tree_sitter_sql, f"language_{dialect}")())
                query = getattr(tree_sitter_sql, f"HIGHLIGHTS_QUERY_{dialect.upper()}")
                Query(language, query)
