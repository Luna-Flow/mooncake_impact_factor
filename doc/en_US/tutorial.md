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

## 2. Run The Local App

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev
```

Then open `http://127.0.0.1:3000`.

The Next.js app currently serves:

- `/`: the research UI
- `/api/*`: JSON APIs backed by SQLite

## 3. Query The APIs

Search:

```text
GET /api/search?q=io&limit=20
```

Advanced search parameters:

- `q`: global full-text search with `AND`, `OR`, `NOT`, parentheses, quoted
  phrases, and field prefixes such as `owner:`, `author:`, `package:`,
  `keyword:`, `description:`, and `name:`
- `owner`, `package`, `keyword`, `description`: field-specific full-text
  filters combined with `AND`
- `license`, `repository`: metadata substring filters
- `rank`: `S`, `A`, `B`, `C`, `D`
- `momentum`: `Rising`, `Hot`, `Stable`
- `min_score`, `max_score`
- `min_dependents`, `min_recent_dependents`, `min_downloads`
- `from_year`, `to_year`: filter by the latest package release year
- `has_repository`, `has_license`: pass `true` or `false`
- `sort`: `relevance`, `score`, `growth`, `downloads`, `dependents`, `recent`,
  `updated`, `name`
- `order`: `asc` or `desc`
- `limit`: maximum `100`

Field semantics:

- `owner` means the package namespace owner from local registry metadata.
- `author:` is currently only an alias for `owner:` so clients can expose a
  more academic-style search syntax.
- The current index does not yet include a standalone author list, maintainer
  list, or institution field, so `author:` is not a separate author metadata
  field yet.

Examples:

```text
GET /api/search?q=owner:gmlewis AND "http client"&limit=20
GET /api/search?q=author:gmlewis AND keyword:json
GET /api/search?keyword=json&min_score=180&min_downloads=500&sort=downloads
GET /api/search?description=parser&from_year=2024&to_year=2026&has_repository=true&sort=updated
GET /api/search?rank=A&momentum=Rising&min_dependents=5&sort=growth
```

Feeds:

```text
GET /api/feeds/top?limit=50
GET /api/feeds/hot?limit=24
GET /api/feeds/rising?limit=24
```

Package analysis:

```text
GET /api/packages/<owner>/<name>/analysis
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
- When `sort=relevance` and at least one full-text condition is present, search
  results are ordered by SQLite `bm25` relevance first.
