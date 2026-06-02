# Contribution Guidelines

This guide describes the current **`0.1.2`** branch baseline and the expected
workflow for repository changes.

## Scope

The repository has four primary responsibilities:

- `src/score`: MoonBit score computation and rank mapping
- `src/cli`: MoonBit CLI bridge for score snapshot interop
- `scripts`: Python-based registry ingestion, download fetching, and SQLite materialization
- `app`, `frontend/src`, and `lib`: Next.js pages, route-handler APIs, and server-side query logic
- `doc` plus root docs: release-aligned repository documentation

Keep each change focused on one of those responsibilities unless the feature
explicitly spans multiple layers, such as score-model updates or API contract
changes.

## Engineering Expectations

- Run `moon fmt` for MoonBit code.
- Keep Python changes explicit and structured around small, testable functions.
- Keep TypeScript changes clear about request parsing, SQLite query behavior, and client state flow.
- Prefer names tied to package metadata, dependency edges, ranking semantics, and search behavior.
- Add comments only when indexing, scoring, or query-compilation behavior would otherwise be hard to infer.

## Documentation Expectations

- `README.md`, `CONTRIBUTING.md`, and `doc/*` must describe the implementation that actually exists on the branch.
- Document stable CLI flags, search parameters, query-builder behavior, score thresholds, and release behavior when they change.
- Be explicit when behavior depends on a local registry snapshot, local SQLite state, cached download data, or optional network fetches.
- If the score formula, rank thresholds, or momentum rules change, update the MoonBit implementation and the relevant docs in the same change.

## Validation

Run the baseline checks before committing:

```bash
moon fmt
moon check src/score --target all
moon check src/cli --target js
moon test src/score --target all
npm run typecheck
npm run build
python3 -m unittest scripts/build_index_test.py
npm test
```

Useful repository commands:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just web-typecheck
just web-build
just serve
just dev
./run_test.sh
```

If you change indexing, route-handler behavior, SQLite query logic, or runtime
UI behavior, validate the affected command paths as well.

## Commit Policy

- Use English Conventional Commits such as `docs:`, `feat:`, `fix:`, `test:`, `refactor:`, or `chore:`.
- Keep each commit focused on one logical change.
- Do not mention file paths in the commit summary.
- Re-check the final commit message immediately before `git commit`.

## Release Checklist

1. Bump the version in `moon.mod`.
2. Keep `README.md`, `CONTRIBUTING.md`, and `doc/*` aligned with the branch.
3. Ensure `.github/workflows/publish.yml` still matches the MoonBit manifest layout.
4. Run `moon fmt`, `moon check src/score --target all`, `moon check src/cli --target js`, `moon test src/score --target all`, `python3 -m unittest scripts/build_index_test.py`, `npm run typecheck`, `npm run build`, and `npm test`.
5. Trigger `publish-package` manually after validation.
6. If mooncakes reports a duplicate version, publish a new bumped version instead.
