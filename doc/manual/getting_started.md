# Getting started

This guide takes you from a fresh checkout to a running web application with
your own rankings, and shows how to query its HTTP API. It describes version
`0.2.0`. The [architecture guide](architecture.md) explains what each step
does.

## Prerequisites

- Python 3
- MoonBit toolchain with `moonc` 0.10 or later
- Node.js 20.16, 22.3 or later, and npm
- A local MoonBit registry snapshot under `~/.moon/registry/index/user`;
  `moon update` creates or refreshes it

## 1. Build the database

Refresh the registry, then build the database with fresh download counts
from mooncakes.io:

```bash
moon update
python3 scripts/build_index.py --db data/mooncake.db --refresh-downloads
```

This command:

- reads every `*.index` record under the local registry
- fetches the download count of every package (about 3,000 requests; without
  `--refresh-downloads` it reuses `data/download_cache.json` and fetches only
  missing packages)
- adds today's counts to `data/download_history.json`, which later builds
  use for the downloads of 30 days ago
- builds the MoonBit command `cli` and runs `build-index` once on the whole
  registry: latest releases, current dependents, signals now and 30 days
  ago, scores, positions, grades and momentum
- recreates the SQLite schema from scratch and writes the report and the
  full-text index

Build without network requests, with the counts already in the cache:

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

`--now 2026-10-01T00:00:00Z` scores the registry as of another moment,
which is useful in tests.

## 2. Run the local app

Install dependencies:

```bash
npm install
```

Run the full-stack Next.js app:

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

`npm run dev` first builds the MoonBit modules the web code imports and
compiles the interface strings. Then open `http://127.0.0.1:3000`, which
sends you to `/en/`, `/zh-cn/` or `/ja/` by your stored or browser
language.

The app serves:

- `/<lang>/`: the rankings, with filters in the sidebar and sortable columns;
  every view is a URL, for example `/en/?momentum=Rising&sort=growth`
- `/<lang>/package/?name=<owner>/<name>`: one package: standing, where the
  score comes from, the last 30 days, dependents, dependencies, releases
- `/<lang>/method/`: how scores work
- `/api/*`: JSON APIs backed directly by SQLite

## 3. Query the APIs

Search:

```text
GET /api/search?q=io&limit=20
```

Supported search parameters:

- `ast`: a serialized query tree (see the [query API](api/query.md))
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
GET /api/feeds/rising?limit=40
GET /api/feeds/new?limit=40
```

Package analysis, with dependents, dependencies and every release; the full
name may have more than two segments:

```text
GET /api/packages/moonbitlang/x
GET /api/packages/tonyfettes/tree-sitter/cli
```

Index metadata (computation time, population, top score, label counts):

```text
GET /api/meta
```

## 4. Validate changes

```bash
moon fmt
moon check src/score src/metrics src/query src/query_sql src/static_search --target all
moon check src/cli --target js
moon test src/score src/metrics src/query src/query_sql src/static_search --target all
python3 -m unittest scripts/build_index_test.py
node scripts/i18n.mjs check
npm run typecheck
npm run build
npm test
```

After changing interface strings in `web/i18n/conf.json`, run
`node scripts/i18n.mjs update` and translate the new or fuzzy entries of
`web/i18n/locale/*/LC_MESSAGES/app.po`.

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
- Download counts may come from live mooncakes responses, `data/download_cache.json`, or a local override file. Only freshly fetched counts enter the download history.
- When `sort=relevance` and at least one full-text condition is present, results are ordered by SQLite `bm25` relevance first.
- The query expression in the sidebar, the `expr` parameter and the `ast` parameter compile through the same MoonBit query tree.
- Static publishing (`npm run build:static-data`, `npm run build:static`) is
  described in the [static_search tutorial](tutorial/static_search.md).
