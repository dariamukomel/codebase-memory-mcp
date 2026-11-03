import XCTest
import SwiftTreeSitter
import TreeSitterSqlMysql

final class TreeSitterSqlMysqlTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_mysql_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading mysql_sql grammar")
    }
}
