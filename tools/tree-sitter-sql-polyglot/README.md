# tree-sitter-sql-polyglot

[![CI](https://github.com/RelativelyUnknown/Tree-sitter-sql-polyglot/actions/workflows/ci.yml/badge.svg)](https://github.com/RelativelyUnknown/Tree-sitter-sql-polyglot/actions/workflows/ci.yml)
[![Publish](https://github.com/RelativelyUnknown/Tree-sitter-sql-polyglot/actions/workflows/publish.yml/badge.svg)](https://github.com/RelativelyUnknown/Tree-sitter-sql-polyglot/actions/workflows/publish.yml)
[![crates.io](https://img.shields.io/crates/v/tree-sitter-sql-polyglot?logo=rust)](https://crates.io/crates/tree-sitter-sql-polyglot)
[![npm](https://img.shields.io/npm/v/@relativelyunknown/tree-sitter-sql-polyglot?logo=npm)](https://www.npmjs.com/package/@relativelyunknown/tree-sitter-sql-polyglot)
[![PyPI](https://img.shields.io/pypi/v/tree-sitter-sql-polyglot?logo=python&logoColor=white)](https://pypi.org/project/tree-sitter-sql-polyglot/)
[![Python](https://img.shields.io/pypi/pyversions/tree-sitter-sql-polyglot)](https://pypi.org/project/tree-sitter-sql-polyglot/)
[![Docs](https://img.shields.io/badge/docs-site-blue)](https://relativelyunknown.github.io/Tree-sitter-sql-polyglot/)
[![License: MIT](https://img.shields.io/github/license/RelativelyUnknown/Tree-sitter-sql-polyglot)](LICENSE)

SQL grammars for [tree-sitter](https://tree-sitter.github.io/): a strict ANSI base and 22 dialects
built on top of it. Each dialect is its own parser, so Postgres code is parsed as Postgres and T-SQL
as T-SQL.

Forked from [DerekStride/tree-sitter-sql](https://github.com/DerekStride/tree-sitter-sql), which
mixes several dialects into one permissive grammar.

## Install

```bash
pip install tree-sitter-sql-polyglot
npm install @relativelyunknown/tree-sitter-sql-polyglot
cargo add tree-sitter-sql-polyglot --features postgres   # or --features full for all 22
go get github.com/relativelyunknown/tree-sitter-sql-polyglot/bindings/go/postgres
```

Swift (SwiftPM) and C (CMake) are supported too. See the
[usage docs](https://relativelyunknown.github.io/Tree-sitter-sql-polyglot/usage).

```python
from tree_sitter import Language, Parser
import tree_sitter_sql

parser = Parser(Language(tree_sitter_sql.language_postgres()))
tree = parser.parse(b"SELECT id FROM users WHERE name ILIKE 'a%'")
```

```js
import Parser from "tree-sitter";
import { postgres } from "@relativelyunknown/tree-sitter-sql-polyglot";

const parser = new Parser();
parser.setLanguage(postgres);
const tree = parser.parse("SELECT id FROM users WHERE name ILIKE 'a%'");
```

Only the dialects you use get compiled or loaded. Each one also ships its own highlights query
(`HIGHLIGHTS_QUERY_POSTGRES` in Python and Rust, `postgres.HIGHLIGHTS_QUERY` in Node).

## Dialects

| Dialect | Extends | Notable syntax |
|---|---|---|
| base | | ANSI SQL: `GROUPING SETS`, `OFFSET ... FETCH`, `WITHIN GROUP`, `GRANT`/`REVOKE` |
| postgres | base | `COPY`, `VACUUM`, `::` casts, `PARTITION OF`, row-level security policies |
| cockroachdb | postgres | `AS OF SYSTEM TIME`, `UPSERT`, `BACKUP`/`RESTORE`, changefeeds |
| mysql | base | `ENGINE=`, index hints, `SHOW`, `LIMIT offset, count`, `@@` variables |
| mariadb | mysql | system-versioned tables, `RETURNING`, `INVISIBLE` columns |
| sqlite | base | `INSERT OR REPLACE`, `AUTOINCREMENT`, `INDEXED BY` |
| oracle | base | PL/SQL blocks and packages, `CONNECT BY`, `BULK COLLECT` |
| db2 | base | SQL PL, modules, audit policies, federated objects |
| tsql | base | T-SQL scripting, `CROSS APPLY`, query hints, `#temp` tables |
| hana | base | column/row tables, `UPSERT ... WITH PRIMARY KEY`, SQLScript |
| teradata | base | `SEL`/`DEL`, `PRIMARY INDEX`, `RANGE_N`, `COLLECT STATISTICS` |
| bigquery | base | `STRUCT<...>`/`ARRAY<...>`, `UNNEST`, `QUALIFY` |
| spanner | bigquery | `INTERLEAVE IN PARENT`, change streams, row deletion policies |
| snowflake | base | scripting, `LATERAL FLATTEN`, time travel, `@stage` |
| redshift | base | `DISTKEY`/`SORTKEY`, external schemas, `COPY`/`UNLOAD` |
| duckdb | base | FROM-first `SELECT`, `EXCLUDE`/`REPLACE`, lambdas, `ASOF JOIN` |
| clickhouse | base | `ENGINE = MergeTree`, `PREWHERE`, `FINAL`, `ARRAY JOIN`, `LIMIT BY` |
| trino | base | `MATCH_RECOGNIZE`, `PREPARE`/`EXECUTE`, lambdas, `ROW` types |
| athena | trino | `UNLOAD ... TO 's3://...'`, `MSCK REPAIR TABLE` |
| flink | base | connector DDL, `WATERMARK FOR`, window TVFs, temporal joins |
| hive | base | `LATERAL VIEW`, `STORED AS`, multi-table `INSERT` |
| spark | hive | `PIVOT`, `QUALIFY`, scripting, Iceberg, `VARIANT` |
| databricks | spark | Delta `OPTIMIZE`/`VACUUM`, Unity Catalog, `COPY INTO` |

A child dialect only adds what its engine adds; it gets the rest from its parent. How much of each
engine's syntax is covered, checked against SQLGlot, ANTLR, pglast and sqlfluff, is on the
[coverage page](https://relativelyunknown.github.io/Tree-sitter-sql-polyglot/coverage).

## Development

You need Node and the tree-sitter CLI (`npm install -g tree-sitter-cli`).

```bash
npm install                  # unpacks the committed parsers and builds the Node addons
npm run generate             # regenerate the base parser after editing grammar/
npm run generate -- postgres # or a single dialect
npm run generate:all         # or everything
npm run test:corpus          # base corpus tests
(cd postgres && npx tree-sitter test)  # a dialect's corpus tests
```

A base grammar change affects every dialect, so regenerate and test all of them. Generation is
cached by file hash; `npm run generate:force` skips the cache.

[CONTRIBUTING.md](CONTRIBUTING.md) covers the workflow and [AGENTS.md](AGENTS.md) the grammar
layout.

## Related

- [DerekStride/tree-sitter-sql](https://github.com/DerekStride/tree-sitter-sql), the upstream grammar
- [takegue/tree-sitter-sql-bigquery](https://github.com/takegue/tree-sitter-sql-bigquery)
- [m-novikov/tree-sitter-sql](https://github.com/m-novikov/tree-sitter-sql)

## License

MIT. The git history from upstream is kept, so upstream authors show up in the contributors list;
[CODEOWNERS](.github/CODEOWNERS) lists who maintains this fork. `LICENSE` carries both copyright
notices.
