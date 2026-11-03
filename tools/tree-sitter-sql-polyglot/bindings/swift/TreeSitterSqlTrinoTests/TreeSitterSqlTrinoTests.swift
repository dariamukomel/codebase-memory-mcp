import XCTest
import SwiftTreeSitter
import TreeSitterSqlTrino

final class TreeSitterSqlTrinoTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_trino_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading trino_sql grammar")
    }
}
