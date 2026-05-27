# Documentation Standard

This repository's documentation must describe the **current implementation on
the branch**. As of `2026-05-27`, the active baseline is **`0.1.0`**.

## Required Document Types

Each language set should cover the current user-facing surface:

1. `README.md` or language overview: repository purpose and entry points
2. `tutorial.md`: setup, index build flow, and local usage
3. `api.md`: exported MoonBit functions or stable HTTP contracts
4. `design.md`: score model, data flow, and implementation constraints

## Organization Rules

- Organize docs by language and subsystem.
- Keep the documentation tree aligned with the repository layout.
- Prefer one document per stable concern instead of mixing API, tutorial, and
  design content in a single long file.
- Do not document unpublished commands, routes, fields, or MoonBit exports.

Recommended structure:

```txt
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
- API docs must match the real MoonBit package name and exported functions.
- If Python scripts expose CLI flags, database behavior, or HTTP API contracts,
  document the stable behavior explicitly.
- Distinguish local-snapshot facts from authoritative ecosystem facts.
- If Python and MoonBit intentionally duplicate the score formula, keep both
  docs and code paths aligned.
