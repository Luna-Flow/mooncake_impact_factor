# Mooncake Impact Factor

[![img](https://img.shields.io/badge/License-MIT-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE)
![img](https://img.shields.io/badge/State-active-success)

Mooncake Impact Factor is a local ranking toolkit for the `mooncakes.io`
ecosystem. The current branch ships three aligned parts:

- a MoonBit scoring package in `src/score`
- a Python index builder in `scripts`
- a Next.js full-stack app for the local UI and APIs

This repository documents the released **`0.1.0`** baseline declared in
`moon.mod`.

## What The Repository Does

The project reads the local MoonBit registry snapshot under
`~/.moon/registry/index/user`, writes a searchable SQLite database, computes a
package impact score, and serves the results through a research-oriented local
web interface.

Current implemented capabilities:

- ingest every local `*.index` manifest record into SQLite
- persist package, version, dependency, reverse-edge, score, and FTS tables
- optionally fetch per-package download counts from `https://mooncakes.io`
- allow download-count overrides from a local JSON file
- expose Next.js route-handler APIs backed directly by SQLite
- keep the score formula aligned between Python and MoonBit
- validate API contracts in the Next.js client and server layers

## Repository Layout

- `src/score/`: MoonBit package with score computation and rank mapping
- `scripts/build_index.py`: local index ingestion, download fetching, and score computation
- `app/`: Next.js App Router pages and route handlers
- `frontend/src/`: shared client UI logic, copy, and schemas used by Next
- `lib/`: server-side SQLite query and API support code
- `web/app.css`: global stylesheet imported by the Next app
- `doc/`: English and Chinese documentation aligned with the current branch
- `.github/workflows/publish.yml`: manual MoonBit package publish workflow

## Quick Start

Requirements:

- MoonBit toolchain for `moon check`, `moon test`, and package publishing
- Python 3 for indexing
- Node.js and npm for the Next.js app
- a populated local registry under `~/.moon/registry/index/user`

Build the database with live mooncakes download snapshots:

```bash
python3 scripts/build_index.py --db data/mooncake.db
```

Build the database without network download lookups:

```bash
python3 scripts/build_index.py --db data/mooncake.db --skip-mooncakes-downloads
```

Apply a local download override file on top of fetched or cached counts:

```bash
python3 scripts/build_index.py \
  --db data/mooncake.db \
  --downloads-json data/downloads.json
```

Install frontend dependencies:

```bash
npm install
```

Run the full-stack Next.js app in development:

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev
```

Then open `http://127.0.0.1:3000`.

Build and run the production app locally:

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run build
MOONCAKE_DB_PATH=data/mooncake.db npm run start
```

## Scoring Model

The score uses four implemented inputs:

- total dependent package count
- recent dependent package count inside a rolling 180-day window
- download count from mooncakes or a local override
- release-recency multiplier derived from the latest release age

The current formula is:

```text
score =
  (ln(dependents + 1) * 38
   + ln(recent_dependents + 1) * 27
   + ln(downloads + 1) * 22)
  * activity_multiplier(days_since_release)
```

Current activity multipliers:

- `<= 30` days: `1.12`
- `<= 90` days: `1.06`
- `<= 180` days: `1.00`
- `<= 365` days: `0.94`
- `> 365` days: `0.88`

Rank labels:

- `S`: `score >= 260`
- `A`: `score >= 180`
- `B`: `score >= 110`
- `C`: `score >= 50`
- `D`: otherwise

Momentum labels are computed in Python only:

- `Rising`: growth `>= 35`, ratio `>= 0.35`, and at least `3` recent dependents
- `Hot`: growth `>= 18`, ratio `>= 0.18`, and at least `2` recent dependents
- `Stable`: otherwise

## Local API

The Next.js app currently exposes:

- `GET /api/feeds/top?limit=<n>`
- `GET /api/feeds/hot?limit=<n>`
- `GET /api/feeds/rising?limit=<n>`
- `GET /api/search?...`
- `GET /api/packages/<owner>/<name>/analysis`

`/api/search` supports advanced retrieval over SQLite FTS5 plus structured
filters. If every search parameter is empty, it falls back to top-ranked
packages.

Supported `/api/search` query parameters:

- `q`: global full-text query with boolean operators, parentheses, quoted
  phrases, and field prefixes such as `owner:`, `author:`, `package:`,
  `keyword:`, `description:`, and `name:`
- `owner`, `package`, `keyword`, `description`: field-specific full-text
  filters that are combined with `AND`
- `license`, `repository`: substring filters on package metadata
- `rank`: one of `S`, `A`, `B`, `C`, `D`
- `momentum`: one of `Rising`, `Hot`, `Stable`
- `min_score`, `max_score`
- `min_dependents`, `min_recent_dependents`, `min_downloads`
- `from_year`, `to_year`: filter by the package latest release year
- `has_repository`, `has_license`: `true` or `false`
- `sort`: one of `relevance`, `score`, `growth`, `downloads`, `dependents`,
  `recent`, `updated`, `name`
- `order`: `asc` or `desc`
- `limit`: result size, clamped to `100`

Field semantics:

- `owner` is the package namespace owner from the local registry metadata.
- `author:` is currently only an alias for `owner:` so frontend clients can use
  a more academic-looking query syntax.
- The current index does not contain a standalone author list, maintainer list,
  or institution metadata, so `author:` does not mean a separate paper-style
  author field yet.

Examples:

```text
GET /api/search?q=owner:gmlewis AND "http client"&limit=20
GET /api/search?q=author:gmlewis AND keyword:json
GET /api/search?keyword=json&min_score=180&min_downloads=500&sort=downloads
GET /api/search?description=parser&from_year=2024&to_year=2026&has_repository=true&sort=updated
GET /api/search?rank=A&momentum=Rising&min_dependents=5&sort=growth
GET /api/packages/gmlewis/http-client/analysis
```

## Development

Useful local commands:

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run start
moon fmt
moon check --target all
moon test --target all
./run_test.sh
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just web-typecheck
just web-build
just serve
just dev
```

## Release Workflow

The GitHub Actions workflow is `publish-package` and is triggered manually by
`workflow_dispatch`.

Before publishing:

1. Bump the version in `moon.mod`.
2. Keep `README.md`, `CONTRIBUTING.md`, and `doc/*` aligned with the branch.
3. Run `moon fmt`, `moon check --target all`, and `moon test --target all`.
4. Ensure `README.md` exists and `moon.mod.json` does not exist.
5. Trigger `publish-package`; it installs MoonBit, runs checks/tests, and calls
   `moon publish` with the `LUNA_MOONCAKE` secret.

If mooncakes rejects the upload because the version already exists, bump the
version before retrying.

## Documentation

- English overview: [doc/en_US/README.md](./doc/en_US/README.md)
- English standard: [doc/en_US/doc_standard.md](./doc/en_US/doc_standard.md)
- Chinese overview: [doc/zh_CN/README.md](./doc/zh_CN/README.md)
- Chinese standard: [doc/zh_CN/doc_standard.md](./doc/zh_CN/doc_standard.md)

Contribution guidance is available in [CONTRIBUTING.md](./CONTRIBUTING.md).
