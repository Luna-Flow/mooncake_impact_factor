# Tutorial

This guide covers the current local workflow for the **`0.1.0`** branch.

## Prerequisites

- Python 3
- MoonBit toolchain
- a local MoonBit registry snapshot under `~/.moon/registry/index/user`

## 1. Build The Database

Build with download lookup enabled:

```bash
python3 scripts/build_index.py --db data/mooncake.db
```

This command:

- reads every `*.index` file under the local registry
- recreates the SQLite schema from scratch
- fetches missing download counts from mooncakes unless disabled
- computes dependency edges, reverse-dependent counts, and package scores

Build without live mooncakes requests:

```bash
python3 scripts/build_index.py --db data/mooncake.db --skip-mooncakes-downloads
```

Apply a local download override file:

```bash
python3 scripts/build_index.py \
  --db data/mooncake.db \
  --downloads-json data/downloads.json
```

The override file must be a JSON object keyed by full package name:

```json
{
  "owner/package": 1234
}
```

## 2. Run The Local Server

```bash
python3 scripts/serve.py --db data/mooncake.db --host 127.0.0.1 --port 8765
```

Then open `http://127.0.0.1:8765`.

The server currently serves:

- `/`: the static HTML shell
- `/app.css`: frontend styles
- `/app.js`: frontend logic
- `/api/*`: JSON APIs backed by SQLite

## 3. Query The APIs

Search:

```text
GET /api/search?q=io&limit=20
```

Top packages:

```text
GET /api/top?limit=50
```

Package detail:

```text
GET /api/packages/<owner>/<name>
```

Dependents:

```text
GET /api/packages/<owner>/<name>/dependents
```

## 4. Validate Changes

```bash
moon fmt
moon check --target all
moon test --target all
```

Repository shortcuts:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just serve
just dev
```

## Notes

- The SQLite database is rebuilt from scratch on each index build.
- Download counts may come from cache, mooncakes live responses, or a local
  override file.
- Search results are ordered by computed score, not by text relevance alone.
