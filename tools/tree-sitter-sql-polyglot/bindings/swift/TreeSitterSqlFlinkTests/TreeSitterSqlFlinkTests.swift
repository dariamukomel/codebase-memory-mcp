import XCTest
import SwiftTreeSitter
import TreeSitterSqlFlink

final class TreeSitterSqlFlinkTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_flink_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading flink_sql grammar")
    }
}
