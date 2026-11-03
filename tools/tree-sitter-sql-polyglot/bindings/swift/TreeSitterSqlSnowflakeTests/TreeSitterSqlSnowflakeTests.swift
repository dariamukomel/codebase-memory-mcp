import XCTest
import SwiftTreeSitter
import TreeSitterSqlSnowflake

final class TreeSitterSqlSnowflakeTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_snowflake_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading snowflake_sql grammar")
    }
}
