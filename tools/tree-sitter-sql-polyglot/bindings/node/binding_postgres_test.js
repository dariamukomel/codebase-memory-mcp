import assert from "node:assert";
import { test } from "node:test";
import Parser from "tree-sitter";
import { postgres } from "./index.js";

test("can load postgres grammar and read the tree", () => {
  const parser = new Parser();
  parser.setLanguage(postgres);
  const tree = parser.parse("VACUUM t;");
  assert.strictEqual(tree.rootNode.type, "program");
  assert.ok(!tree.rootNode.hasError);
});

test("postgres highlights query compiles and captures", () => {
  assert.ok(postgres.HIGHLIGHTS_QUERY, "postgres.HIGHLIGHTS_QUERY is missing");
  const parser = new Parser();
  parser.setLanguage(postgres);
  const query = new Parser.Query(postgres, postgres.HIGHLIGHTS_QUERY);
  const keywords = query.captures(parser.parse("VACUUM t;").rootNode)
    .filter((c) => c.name === "keyword").map((c) => c.node.text);
  assert.deepStrictEqual(keywords, ["VACUUM"]);
});
