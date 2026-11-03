import XCTest
import SwiftTreeSitter
import TreeSitterSqlTsql

final class TreeSitterSqlTsqlTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_tsql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading tsql grammar")
    }
}
