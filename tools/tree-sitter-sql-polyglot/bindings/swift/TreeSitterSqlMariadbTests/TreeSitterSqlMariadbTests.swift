import XCTest
import SwiftTreeSitter
import TreeSitterSqlMariadb

final class TreeSitterSqlMariadbTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_mariadb_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading mariadb_sql grammar")
    }
}
