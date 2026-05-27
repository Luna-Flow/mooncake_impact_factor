# Mooncake Impact Factor

[![img](https://img.shields.io/badge/License-MIT-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE)
![img](https://img.shields.io/badge/State-active-success)

Mooncake Impact Factor is a local ranking toolkit for the `mooncakes.io`
ecosystem. The current branch ships three aligned parts:

- a MoonBit scoring package in `src/score`
- a Python index builder and HTTP server in `scripts`
- a static browser UI in `web`

This repository documents the released **`0.1.0`** baseline declared in
`moon.mod`.

## What The Repository Does

The project reads the local MoonBit registry snapshot under
`~/.moon/registry/index/user`, writes a searchable SQLite database, computes a
package impact score, and serves the results through a local web interface.

Current implemented capabilities:

- ingest every local `*.index` manifest record into SQLite
- persist package, version, dependency, reverse-edge, score, and FTS tables
- optionally fetch per-package download counts from `https://mooncakes.io`
- allow download-count overrides from a local JSON file
- expose search, top-list, package-detail, and dependents HTTP endpoints
- keep the score formula aligned between Python and MoonBit

## Repository Layout

- `src/score/`: MoonBit package with score computation and rank mapping
- `scripts/build_index.py`: local index ingestion, download fetching, and score computation
- `scripts/serve.py`: local HTTP server for APIs and static assets
- `web/`: static frontend for search results and package detail inspection
- `doc/`: English and Chinese documentation aligned with the current branch
- `.github/workflows/publish.yml`: manual MoonBit package publish workflow

## Quick Start

Requirements:

- MoonBit toolchain for `moon check`, `moon test`, and package publishing
- Python 3 for indexing and local serving
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

Serve the local UI and APIs:

```bash
python3 scripts/serve.py --db data/mooncake.db --host 127.0.0.1 --port 8765
```

Then open `http://127.0.0.1:8765`.

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

The HTTP server currently exposes:

- `GET /api/search?q=<term>&limit=<n>`
- `GET /api/top?limit=<n>`
- `GET /api/packages/<owner>/<name>`
- `GET /api/packages/<owner>/<name>/dependents`

`/api/search` uses SQLite FTS5 against package name, owner, description, and
keywords. An empty search falls back to top-ranked packages.

## Development

Useful local commands:

```bash
moon fmt
moon check --target all
moon test --target all
./run_test.sh
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
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
