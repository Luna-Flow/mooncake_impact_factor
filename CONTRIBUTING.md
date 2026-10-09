# Contribution Guidelines

This guide describes the current **`0.2.0`** branch baseline and the expected
workflow for repository changes.

## Scope

The repository has four primary responsibilities:

- `src/metrics`: MoonBit registry signals (latest releases, current dependents, the 30-days-ago snapshot)
- `src/score`: MoonBit score, grades, rank positions and momentum
- `src/cli`: MoonBit `build-index` command that runs `metrics` for the Python index builder
- `src/query`: query language (tree, parser, serializer, flat parameters, labels, sort keys, paging)
- `src/query_sql`: search requests compiled to SQLite statements
- `src/static_search`: static site search engine; the three are built to `lib/moonbit/` by `npm run build:moonbit`
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
- If the score formula, grades, momentum rules or signal definitions change, update the MoonBit implementation and the relevant docs in the same change.
- Interface strings live in `web/i18n/conf.json`; after changing them run `node scripts/i18n.mjs update`, translate the new or fuzzy entries of `web/i18n/locale/*/LC_MESSAGES/app.po`, and commit the strings and catalogs together.
- The manual follows the Luna-Flow documentation standard: English pages live in `doc/manual` (`api/`, `tutorial/` and `design/` pages for every package, plus guides), and translations live in `doc/locale/*/LC_MESSAGES/manual.po`. After editing pages, run `lunadoc update` and commit the pages and catalogs together.
- Record user-visible changes in `CHANGELOG.md`.

## Validation

Run the baseline checks before committing:

```bash
moon fmt
moon check src/score src/metrics --target all
moon check src/cli --target js
moon check src/query src/query_sql src/static_search --target all
moon test src/score src/metrics --target all
moon test src/query src/query_sql src/static_search --target all
node scripts/i18n.mjs check
npm run typecheck
npm run build
python3 -m unittest scripts/build_index_test.py
npm test
npm run build:static-data
npm run build:static
```

Useful repository commands:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just build-static-data
just static-build
just static-serve
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
4. Run `moon fmt`, `moon check src/score src/metrics --target all`, `moon check src/cli --target js`, `moon check src/query src/query_sql src/static_search --target all`, `moon test src/score src/metrics --target all`, `moon test src/query src/query_sql src/static_search --target all`, `moon info` (commit the regenerated `pkg.generated.mbti`), `python3 -m unittest scripts/build_index_test.py`, `node scripts/i18n.mjs check`, `npm run typecheck`, `npm run build`, `npm run build:static-data`, `npm run build:static`, and `npm test`.
5. Trigger `publish-package` manually after validation.
6. If mooncakes reports a duplicate version, publish a new bumped version instead.
