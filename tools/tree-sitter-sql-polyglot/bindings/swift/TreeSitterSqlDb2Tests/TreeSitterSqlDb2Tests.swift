import XCTest
import SwiftTreeSitter
import TreeSitterSqlDb2

final class TreeSitterSqlDb2Tests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_db2_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading db2_sql grammar")
    }
}
