import XCTest
import SwiftTreeSitter
import TreeSitterSqlTeradata

final class TreeSitterSqlTeradataTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_teradata_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading teradata_sql grammar")
    }
}
