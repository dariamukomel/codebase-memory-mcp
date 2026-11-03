import XCTest
import SwiftTreeSitter
import TreeSitterSqlSqlite

final class TreeSitterSqlSqliteTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_sqlite_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading sqlite_sql grammar")
    }
}
