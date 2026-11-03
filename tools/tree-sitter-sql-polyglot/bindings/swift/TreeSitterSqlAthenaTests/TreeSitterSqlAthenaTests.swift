import XCTest
import SwiftTreeSitter
import TreeSitterSqlAthena

final class TreeSitterSqlAthenaTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_athena_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading athena_sql grammar")
    }
}
