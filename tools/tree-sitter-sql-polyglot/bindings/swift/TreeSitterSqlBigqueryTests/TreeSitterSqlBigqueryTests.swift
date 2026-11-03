import XCTest
import SwiftTreeSitter
import TreeSitterSqlBigquery

final class TreeSitterSqlBigqueryTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_bigquery_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading bigquery_sql grammar")
    }
}
