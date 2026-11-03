import XCTest
import SwiftTreeSitter
import TreeSitterSqlHive

final class TreeSitterSqlHiveTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_hive_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading hive_sql grammar")
    }
}
