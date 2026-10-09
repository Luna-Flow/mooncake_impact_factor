# Repository conventions

These rules add to the Luna-Flow documentation standard for
`mooncake_impact_factor`. The repository combines five MoonBit packages
(`score`, `cli`, `query`, `query_sql` and `static_search`), a Python index builder, and a Next.js
application, so its documentation must keep all of them in step.

## Scope

- Describe the current **`0.1.2`** baseline on the branch.
- Do not document unpublished commands, routes, fields, or MoonBit exports.
- When behavior is local-only, say so directly instead of implying a global
  service contract.

## Consistency

- `README.md`, `CONTRIBUTING.md`, and the manual must tell the same release story.
- API docs must match the actual MoonBit package name, function signatures, and Next.js route contracts.
- If Python scripts expose stable CLI flags, database behavior, or search semantics, document them explicitly.
- Distinguish local registry facts from authoritative mooncakes facts.
- The score formula, rank thresholds and momentum rules are owned by `src/score`. The design page derives their properties from the code; change both in the same commit.
- The query language, its SQL compilation and the static search are owned by `src/query`, `src/query_sql` and `src/static_search`; the TypeScript files only wrap them.
- Behaviour implemented outside MoonBit (signal counting) is documented in the guide or design page that uses it, with a link to the file that implements it.
