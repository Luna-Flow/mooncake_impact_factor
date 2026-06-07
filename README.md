# MOONCAKE IMPACT FACTOR

[![img](https://img.shields.io/badge/Maintainer-KCN--judu-violet)](https://github.com/KCN-judu) [![img](https://img.shields.io/badge/License-Apache%202.0-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE) ![img](https://img.shields.io/badge/State-active-success)

## v0.1.2 - Query Builder, Search & Analysis

This documentation tracks the current **`0.1.2`** release baseline declared in
`moon.mod`.

### Package Positioning

- **`src/score`**: MoonBit package that exposes the reusable impact-score computation and rank mapping.
- **`src/cli`**: MoonBit CLI bridge that serves score snapshot computation to non-MoonBit callers.
- **`scripts/build_index.py`**: Local registry ingester that rebuilds SQLite state, computes package relationships, and materializes search data.
- **`app` + `frontend/src` + `lib`**: Next.js full-stack research UI with route-handler APIs backed directly by SQLite.

### What Defines v0.1.2

- **Local Registry Snapshot Ingestion**: Reads `~/.moon/registry/index/user/**/*.index` and rebuilds package, version, dependency, reverse-edge, score, and FTS tables.
- **SQLite-Backed Search Surface**: Exposes ranked feeds, full-text search, structured filters, and per-package analysis endpoints from the Next.js app.
- **Graphical Advanced Query Builder**: Exposes a grouped advanced-search UI that can build nested boolean conditions while preserving direct native-expression input.
- **Unified Query AST Layer**: Supports serialized `ast` queries, `expr` native expressions, and legacy structured search parameters through one server-side query model.
- **Shared Score Formula**: Uses the MoonBit score package plus a local MoonBit CLI bridge so the Python index builder consumes the same score, rank, and momentum rules.
- **Download Signal Support**: Can fetch per-package download counts from `mooncakes.io`, reuse a local cache, or apply a local override JSON file.
- **Momentum Layer**: Uses MoonBit-exported momentum rules through the local CLI bridge, then materializes `Rising`, `Hot`, and `Stable` labels in the Python build pipeline.
- **Release-Aligned Documentation**: `README.md`, `CONTRIBUTING.md`, and localized docs are intended to describe the real branch state rather than a speculative roadmap.

### API Guidance & Data Semantics

- **Search Authority**: Results are derived from a local registry snapshot plus optional mooncakes download metadata; they are not a canonical global ranking.
- **Author Query Alias**: `author:` in the full-text query language is currently only an alias for `owner:` because the index does not yet store a separate author list.
- **Relevance Ordering**: `sort=relevance` is only meaningful when at least one full-text condition is present; otherwise the API falls back to score-oriented ordering.
- **Mutable Data Source**: Rebuilding the SQLite database replaces previous derived state, so rankings reflect the local snapshot used for the most recent build.

### Key Features

- **Impact Ranking**: Scores packages from dependent count, recent dependent growth, download volume, and release recency.
- **Advanced Retrieval**: Supports FTS search with boolean syntax, field-prefixed terms, numeric thresholds, year filters, and rank or momentum filtering.
- **Advanced Retrieval**: Supports FTS queries, graphical grouped filters, serialized AST queries, native expression queries, numeric thresholds, year filters, and rank or momentum filtering.
- **Package Analysis View**: Serves detailed package metadata, version history, score breakdown fields, and dependent package summaries.
- **Full Local Workflow**: Includes indexing, caching, score computation, API serving, and browser-based inspection in one repository.

## Quick Start

### Prerequisites

- MoonBit toolchain
- Python 3
- Node.js and npm
- A populated local registry under `~/.moon/registry/index/user`

### Build the local database

With live mooncakes download lookups:

```bash
python3 scripts/build_index.py --db data/mooncake.db
```

Offline, without network download fetches:

```bash
python3 scripts/build_index.py --db data/mooncake.db --skip-mooncakes-downloads
```

With a local download override file:

```bash
python3 scripts/build_index.py \
  --db data/mooncake.db \
  --downloads-json data/downloads.json
```

### Run the web app

```bash
npm install
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

Then open `http://127.0.0.1:3000`.

### Run quality checks

```bash
moon fmt
moon check src/score --target all
moon check src/cli --target js
moon check src/static_search --target js
moon test src/score --target all
moon test src/static_search --target js
python3 -m unittest scripts/build_index_test.py
npm run typecheck
npm run build
npm run build:static-data
npm run build:static
npm test
```

### Build static publish artifacts

```bash
npm run build:static-data
npm run build:static
npm run serve:static
```

## Documentation Map

### Core

- Contribution workflow: `CONTRIBUTING.md`
- English docs index: `doc/en_US/README.md`
- Chinese docs index: `doc/zh_CN/README.md`

### English

- Documentation standard: `doc/en_US/doc_standard.md`
- Tutorial: `doc/en_US/tutorial.md`
- Score API: `doc/en_US/score/api.md`
- Score design: `doc/en_US/score/design.md`

### 简体中文

- 文档标准: `doc/zh_CN/doc_standard.md`
- 使用教程: `doc/zh_CN/tutorial.md`
- 评分 API: `doc/zh_CN/score/api.md`
- 评分设计: `doc/zh_CN/score/design.md`

## Current Repository Highlights

- **Index Build Pipeline**:
  - Recreates SQLite tables from scratch on every build.
  - Tracks packages, versions, direct dependencies, package edges, score snapshots, and an FTS5 search index.
  - Can reuse `data/download_cache.json` and merge local override data from `--downloads-json`.

- **Score Model**:
  - `compute_score()` combines total dependents, recent dependents, downloads, and release age.
  - `rank_label()` maps the raw score to `S`, `A`, `B`, `C`, or `D`.
  - `compute_momentum_label()` maps score deltas to `Rising`, `Hot`, or `Stable`.
  - `compute_score_snapshot()` returns score, historical score, growth, growth ratio, rank label, momentum label, and activity multiplier in one MoonBit call.
  - Python keeps the indexing and SQLite materialization flow, but delegates score snapshot and momentum-rule evaluation to the MoonBit CLI.

- **Serving Surface**:
  - `GET /api/feeds/top?limit=<n>`
  - `GET /api/feeds/hot?limit=<n>`
  - `GET /api/feeds/rising?limit=<n>`
  - `GET /api/search?...`
  - `GET /api/packages/<owner>/<packageName>/analysis`

- **Validation Surface**:
  - `tests/data.test.mjs` covers search parsing, AST/native expression search, and analysis ordering behavior.
  - `scripts/build_index_test.py` covers index-builder-side scoring and data-shaping behavior.
  - `src/static_search` builds to JS for the static publishing path and is validated by MoonBit tests.

## Static Publishing

- **Dynamic research mode** keeps SQLite, route handlers, and server-side query execution for local iteration.
- **Static publish mode** exports `public/data/**` JSON assets and a GitHub Pages-compatible `out/` site.
- The scheduled GitHub Actions workflow is `deploy-static`.

## Development

Useful local commands:

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
moon fmt
moon check src/score --target all
moon check src/cli --target js
moon test src/score --target all
npm run typecheck
npm run build
./run_test.sh
```

## Release Workflow

The GitHub Actions workflows are:

- `publish-package` for MoonBit package publishing
- `ci` for push / pull-request validation
- `deploy-static` for scheduled static-site rebuild and GitHub Pages deployment

Before publishing:

1. Bump the version in `moon.mod`.
2. Keep `README.md`, `CONTRIBUTING.md`, and `doc/*` aligned with the branch.
3. Run `moon fmt`, `moon check src/score --target all`, `moon check src/cli --target js`, `moon check src/static_search --target js`, `moon test src/score --target all`, `moon test src/static_search --target js`, `python3 -m unittest scripts/build_index_test.py`, `npm run typecheck`, `npm run build`, `npm run build:static-data`, `npm run build:static`, and `npm test`.
4. Ensure `README.md` exists and `moon.mod.json` does not exist.
5. Trigger `publish-package`; it installs MoonBit, runs checks, and calls `moon publish` with the `LUNA_MOONCAKE` secret.

If mooncakes rejects the upload because the version already exists, publish a
new bumped version instead.
