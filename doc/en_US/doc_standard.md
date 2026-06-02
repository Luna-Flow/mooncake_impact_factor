# Documentation Standard

This repository's documentation must describe the **current implementation on
the branch**. The active branch baseline is **`0.1.2`**.

## Required Document Types

Each language set should cover the current stable surface:

1. `README.md`: repository purpose, quick start, and document entry points
2. `tutorial.md`: local setup, index-build flow, and runtime usage
3. `score/api.md`: exported MoonBit functions and stable HTTP contracts
4. `score/design.md`: score model, data flow, and implementation constraints

## Organization Rules

- Organize docs by language and subsystem.
- Keep the documentation tree aligned with the repository layout.
- Prefer one document per stable concern instead of mixing tutorial, API, and design material into one long page.
- Do not document unpublished commands, routes, fields, or MoonBit exports.
- When behavior is local-only, say so directly instead of implying a global service contract.

Recommended structure:

```txt
README.md
CONTRIBUTING.md
doc/
  en_US/
    README.md
    doc_standard.md
    tutorial.md
    score/
      api.md
      design.md
  zh_CN/
    README.md
    doc_standard.md
    tutorial.md
    score/
      api.md
      design.md
```

## Consistency Rules

- `README.md`, `CONTRIBUTING.md`, and `doc/*` must tell the same release story.
- API docs must match the actual MoonBit package name, function signatures, and Next.js route contracts.
- If Python scripts expose stable CLI flags, database behavior, or search semantics, document them explicitly.
- Distinguish local registry facts from authoritative mooncakes facts.
- If Python and MoonBit intentionally share the score formula, keep both docs and code paths aligned.
