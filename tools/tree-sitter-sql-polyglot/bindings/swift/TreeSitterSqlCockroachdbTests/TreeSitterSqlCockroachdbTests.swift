import XCTest
import SwiftTreeSitter
import TreeSitterSqlCockroachdb

final class TreeSitterSqlCockroachdbTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_cockroachdb_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading cockroachdb_sql grammar")
    }
}
