import XCTest
import SwiftTreeSitter
import TreeSitterSqlSpanner

final class TreeSitterSqlSpannerTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_spanner_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading spanner_sql grammar")
    }
}
