# SQL fork validation

Dynamic syntax is limited to the dollar forms implemented by
`dynamic_identifier`. LET and Jinja syntax are not part of the grammar.

Existing SQL productions annotate their already-supported object references
with semantic Tree-sitter fields (`target`, `table`, `function`, `qualifier`,
`type`, and related structural roles). These annotations must not be replaced
with extractor-side statement keyword lists.

The source grammar and scanner are authoritative. Existing parser.c artifacts
may be from an older grammar until a full generation succeeds and is verified.

`tree-sitter generate --no-parser` emits grammar.json and node-types.json only.
It does NOT validate LR conflicts, build parse tables, or calculate MAX_ACTIONS.
Do not describe its success as a conflict or parse-table validation.

Exact action indices require construction and optimization of the automaton.
Tree-sitter 0.26.3 render.rs assigns indices to distinct ParseTableEntry values,
advancing the index by `1 + entry.actions.len()` for each new entry. Grammar
rule counts and lexer-state counts cannot predict the resulting maximum.
A diagnostic generator could omit C rendering, but would still need the
expensive table-construction phase. The stock CLI has no cheap exact preflight.

Before proposing grammar changes, inspect their impact and distinguish hypotheses
from measured results. Never claim a predicted MAX_ACTIONS as a measured value.
After an authorized full generation, run:

```sh
node check-parser-limits.mjs
```

This checks the existing artifact, not the current grammar. Do not copy or use
an overflowing artifact. After limits pass, compile with overflow warnings as
errors and test CSTs and extraction. Scanner-only tests do not validate CSTs.

Full generation is performed by the user in this workspace because of memory
pressure. Stop at that boundary; do not launch it automatically.
