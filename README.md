# MOONCAKE IMPACT FACTOR

[![img](https://img.shields.io/badge/Maintainer-KCN--judu-violet)](https://github.com/KCN-judu) [![img](https://img.shields.io/badge/License-MIT-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE) ![img](https://img.shields.io/badge/State-active-success)

## v0.1.1 - Local Registry Ranking, Search & Analysis

This documentation tracks the current **`0.1.1`** release baseline declared in
`moon.mod`.

### Package Positioning

- **`src/score`**: MoonBit package that exposes the reusable impact-score computation and rank mapping.
- **`scripts/build_index.py`**: Local registry ingester that rebuilds SQLite state, computes package relationships, and materializes search data.
- **`app` + `frontend/src` + `lib`**: Next.js full-stack research UI with route-handler APIs backed directly by SQLite.

### What Defines v0.1.1

- **Local Registry Snapshot Ingestion**: Reads `~/.moon/registry/index/user/**/*.index` and rebuilds package, version, dependency, reverse-edge, score, and FTS tables.
- **SQLite-Backed Search Surface**: Exposes ranked feeds, full-text search, structured filters, and per-package analysis endpoints from the Next.js app.
- **Shared Score Formula**: Keeps the MoonBit package and Python index builder aligned on the same score equation and rank thresholds.
- **Download Signal Support**: Can fetch per-package download counts from `mooncakes.io`, reuse a local cache, or apply a local override JSON file.
- **Momentum Layer**: Computes `Rising`, `Hot`, and `Stable` labels in the Python build pipeline for the serving layer.
- **Release-Aligned Documentation**: `README.md`, `CONTRIBUTING.md`, and localized docs are intended to describe the real branch state rather than a speculative roadmap.

### API Guidance & Data Semantics

- **Search Authority**: Results are derived from a local registry snapshot plus optional mooncakes download metadata; they are not a canonical global ranking.
- **Author Query Alias**: `author:` in the full-text query language is currently only an alias for `owner:` because the index does not yet store a separate author list.
- **Relevance Ordering**: `sort=relevance` is only meaningful when at least one full-text condition is present; otherwise the API falls back to score-oriented ordering.
- **Mutable Data Source**: Rebuilding the SQLite database replaces previous derived state, so rankings reflect the local snapshot used for the most recent build.

### Key Features

- **Impact Ranking**: Scores packages from dependent count, recent dependent growth, download volume, and release recency.
- **Advanced Retrieval**: Supports FTS search with boolean syntax, field-prefixed terms, numeric thresholds, year filters, and rank or momentum filtering.
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
moon check --target all
moon test --target all
npm run typecheck
npm run build
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
  - Python additionally computes `score_30d_ago`, growth, growth ratio, momentum label, and activity multiplier for serving.

- **Serving Surface**:
  - `GET /api/feeds/top?limit=<n>`
  - `GET /api/feeds/hot?limit=<n>`
  - `GET /api/feeds/rising?limit=<n>`
  - `GET /api/search?...`
  - `GET /api/packages/<owner>/<packageName>/analysis`

## Development

Useful local commands:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just web-typecheck
just web-build
just serve
just dev
moon fmt
moon check --target all
moon test --target all
npm run typecheck
npm run build
./run_test.sh
```

## Release Workflow

The GitHub Actions workflow is `publish-package` and is triggered manually by
`workflow_dispatch`.

Before publishing:

1. Bump the version in `moon.mod`.
2. Keep `README.md`, `CONTRIBUTING.md`, and `doc/*` aligned with the branch.
3. Run `moon fmt`, `moon check --target all`, `moon test --target all`, `npm run typecheck`, and `npm run build`.
4. Ensure `README.md` exists and `moon.mod.json` does not exist.
5. Trigger `publish-package`; it installs MoonBit, runs checks, and calls `moon publish` with the `LUNA_MOONCAKE` secret.

If mooncakes rejects the upload because the version already exists, publish a
new bumped version instead.
