#!/bin/bash
# Verify that every keyword reachable in a parse tree (i.e. present in
# node-types.json) is also listed in the @keyword capture in highlights.scm.
# Keywords defined in grammar.js but not yet referenced by any rule are
# intentionally excluded; they cannot appear in highlights.scm until they
# are actually used (tree-sitter rejects query captures for unreachable types).

mkdir -p tmp/tree-sitter-sql/

# Reachable keywords: those present in the generated node-types.json
cat src/node-types.json |
  jq '.[] | select(.type | startswith("keyword")) | .type' |
  tr -d '"' |
  sort > tmp/tree-sitter-sql/keywords.txt

cat queries/highlights.scm |
  grep -o "keyword\w\+" |
  sort > tmp/tree-sitter-sql/highlights.txt

keywords=$(comm -3 tmp/tree-sitter-sql/keywords.txt tmp/tree-sitter-sql/highlights.txt)

if [[ "$keywords" ]]; then
  echo "ERROR: reachable keywords (node-types.json) are not in sync with queries/highlights.scm"
  echo "$keywords"
  exit 1
fi

echo "OK"
