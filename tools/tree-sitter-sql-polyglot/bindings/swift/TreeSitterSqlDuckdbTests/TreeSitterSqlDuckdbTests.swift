import XCTest
import SwiftTreeSitter
import TreeSitterSqlDuckdb

final class TreeSitterSqlDuckdbTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_duckdb_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading duckdb_sql grammar")
    }
}
