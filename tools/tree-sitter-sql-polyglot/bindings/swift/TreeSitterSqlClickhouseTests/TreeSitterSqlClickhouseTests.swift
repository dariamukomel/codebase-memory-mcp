import XCTest
import SwiftTreeSitter
import TreeSitterSqlClickhouse

final class TreeSitterSqlClickhouseTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_clickhouse_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading clickhouse_sql grammar")
    }
}
