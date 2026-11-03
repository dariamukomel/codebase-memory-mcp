import XCTest
import SwiftTreeSitter
import TreeSitterSqlSpark

final class TreeSitterSqlSparkTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_spark_sql())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading spark_sql grammar")
    }
}
