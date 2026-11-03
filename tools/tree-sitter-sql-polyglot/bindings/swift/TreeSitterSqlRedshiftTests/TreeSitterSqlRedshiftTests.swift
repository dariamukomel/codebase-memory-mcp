import XCTest
import SwiftTreeSitter
import TreeSitterSqlRedshift

final class TreeSitterSqlRedshiftTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_redshift_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading redshift_sql grammar")
    }
}
