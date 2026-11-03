#!/bin/bash
# Set the version across all manifests in one shot - works equally for a
# forward bump (0.1.0 -> 0.2.0) or a deliberate downgrade/reset (2.0.0 ->
# 0.1.0): every step below is a plain string replacement, not a semver
# comparison, so there's nothing version-direction-specific to get wrong.
# Usage: bash scripts/bump-version.sh <version>
# Example: bash scripts/bump-version.sh 0.4.0

VERSION=$1
if [[ -z "$VERSION" ]]; then
  echo "Usage: bash scripts/bump-version.sh <version>"
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+].+)?$ ]]; then
  echo "Error: \"$VERSION\" doesn't look like a semver version (expected x.y.z)"
  exit 1
fi

# package.json and tree-sitter.json (root + every dialect).
# Glob all dialect tree-sitter.json files so new dialects are covered automatically.
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" tree-sitter.json
for ts in */tree-sitter.json; do
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ts"
done

# Cargo.toml (first occurrence; the [package] version)
sed -i "0,/^version = .*/s/^version = .*/version = \"$VERSION\"/" Cargo.toml

# pyproject.toml
sed -i "s/^version = .*/version = \"$VERSION\"/" pyproject.toml

# CMakeLists.txt is fully regenerated below, not hand-patched: it reads its
# VERSION/HOMEPAGE_URL from package.json (already updated above) each time
# scripts/generate-bindings.js runs, the same way bindings/rust/lib.rs and
# the other four bindings are regenerated rather than hand-edited. This also
# rewrites every per-dialect CMake option block, so this one call is what
# actually propagates the version everywhere CMake cares about it.
node scripts/generate-bindings.js

# package-lock.json's root version, kept in sync with package.json
npm install --package-lock-only >/dev/null

echo "Set version to $VERSION everywhere"
echo ""
echo "Verify with:"
echo "  grep -n 'version' package.json package-lock.json tree-sitter.json Cargo.toml pyproject.toml"
echo "  grep -n 'VERSION \"' CMakeLists.txt"
