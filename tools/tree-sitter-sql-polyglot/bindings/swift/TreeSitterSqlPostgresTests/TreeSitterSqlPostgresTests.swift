import XCTest
import SwiftTreeSitter
import TreeSitterSqlPostgres

final class TreeSitterSqlPostgresTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_postgres_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading postgres_sql grammar")
    }
}
