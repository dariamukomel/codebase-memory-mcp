import XCTest
import SwiftTreeSitter
import TreeSitterSqlDatabricks

final class TreeSitterSqlDatabricksTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_databricks_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading databricks_sql grammar")
    }
}
