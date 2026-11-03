import XCTest
import SwiftTreeSitter
import TreeSitterSqlHana

final class TreeSitterSqlHanaTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_hana_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading hana_sql grammar")
    }
}
