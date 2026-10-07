# Repository conventions

These rules add to the Luna-Flow documentation standard for
`mooncake_impact_factor`. The repository combines a MoonBit score package, a
Python index builder, and a Next.js application, so its documentation must keep
all three in step.

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
- If Python and MoonBit intentionally share the score formula, keep both docs and code paths aligned.
