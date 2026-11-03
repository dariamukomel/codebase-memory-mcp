import XCTest
import SwiftTreeSitter
import TreeSitterSqlOracle

final class TreeSitterSqlOracleTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_oracle_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading oracle_sql grammar")
    }
}
