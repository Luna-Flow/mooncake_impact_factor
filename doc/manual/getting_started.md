# Getting started

This guide takes you from a fresh checkout to a running web application with
your own rankings, and shows how to query its HTTP API. It describes version
`0.1.2`. The [architecture guide](architecture.md) explains what each step
does.

## Prerequisites

- Python 3
- MoonBit toolchain with `moonc` 0.10 or later
- Node.js 20.16, 22.3 or later, and npm
- A local MoonBit registry snapshot under `~/.moon/registry/index/user`;
  `moon update` creates or refreshes it

## 1. Build the database

Build the `cli` command that scores packages, then the database, with live
mooncakes download lookup enabled:

```bash
moon update
moon build src/cli --target js
python3 scripts/build_index.py --db data/mooncake.db
```

This command:

- reads every `*.index` record under the local registry
- recreates the SQLite schema from scratch
- fetches missing download counts from mooncakes unless disabled
- computes package edges, reverse-dependent counts, score snapshots (through
  the MoonBit `cli` command), and the FTS index

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

## 2. Run the local app

Install dependencies:

```bash
npm install
```

Run the full-stack Next.js app:

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

Then open `http://127.0.0.1:3000`.

The app currently serves:

- `/`: ranked package browsing UI
- `/search`: main search results page
- `/advanced-search`: graphical advanced-search UI with grouped conditions and native-expression editing
- `/api/*`: JSON APIs backed directly by SQLite

## 3. Query the APIs

Search:

```text
GET /api/search?q=io&limit=20
```

Supported search parameters:

- `ast`: serialized grouped query AST used by the advanced query builder
- `expr`: native boolean search expression compiled into the shared query AST
- `q`: global full-text query with `AND`, `OR`, `NOT`, parentheses, quoted phrases, and field prefixes such as `owner:`, `author:`, `package:`, `keyword:`, `description:`, and `name:`
- `owner`, `package`, `keyword`, `description`: field-specific full-text filters combined with `AND`
- `license`, `repository`: metadata substring filters
- `rank`: `S`, `A`, `B`, `C`, `D`, or a comma-separated list such as `S,A`
- `momentum`: `New`, `Rising`, `Stable`, `Cooling`, or a list such as `Rising,New`
- `min_score`, `max_score`
- `min_dependents`, `min_recent_dependents`, `min_external_dependents`, `min_owners`, `min_downloads`
- `max_age`: days since the latest release
- `from_year`, `to_year`
- `has_repository`, `has_license`: `true` or `false`
- `sort`: `relevance`, `score`, `growth`, `downloads`, `dependents`, `recent`, `updated`, `name`, `external`, `owners`, `position`, `age`
- `order`: `asc` or `desc`
- `limit`: page size, `50` by default, at most `200`
- `offset`: matches to skip, `0` by default

The answer is `{ "items": [...], "total": n }`, where `total` counts the
matches before paging. A request without any criterion lists every package
by rank position. Invalid parameters, including a malformed `ast` or `expr`,
are answered with HTTP 400 and `{ "error": "<message>" }`.

Field semantics:

- `owner` means the package namespace owner from local registry metadata.
- `author:` is currently only an alias for `owner:`.
- The index does not yet store a separate author list, maintainer list, or institution field.

Examples:

```text
GET /api/search?expr=(owner:gmlewis OR keyword:json) AND score>=180
GET /api/search?ast=<serialized-query-ast>
GET /api/search?q=owner:gmlewis AND "http client"&limit=20
GET /api/search?q=author:gmlewis AND keyword:json
GET /api/search?keyword=json&min_score=180&min_downloads=500&sort=downloads
GET /api/search?description=parser&from_year=2024&to_year=2026&has_repository=true&sort=updated
GET /api/search?rank=S,A&momentum=Rising&min_dependents=5&sort=growth
GET /api/search?expr=owners>=3 AND age<=90&limit=20&offset=20
```

Feeds:

```text
GET /api/feeds/top?limit=50
GET /api/feeds/hot?limit=24
GET /api/feeds/rising?limit=24
```

Package analysis:

```text
GET /api/packages/<owner>/<packageName>/analysis
```

## 4. Validate changes

```bash
moon fmt
moon check --target all
moon test --target js
moon test src/score --target all
python3 -m unittest scripts/build_index_test.py
npm run typecheck
npm run build
npm test
```

Repository shortcuts:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just web-typecheck
just web-build
just serve
just dev
```

## Notes

- The SQLite database is rebuilt from scratch on each index build.
- Download counts may come from live mooncakes responses, `data/download_cache.json`, or a local override file.
- When `sort=relevance` and at least one full-text condition is present, results are ordered by SQLite `bm25` relevance first.
- The advanced query builder and the native `expr` input both compile through the same shared query AST layer.
- Static publishing (`npm run build:static-data`, `npm run build:static`) is
  described in the [static_search tutorial](tutorial/static_search.md).
