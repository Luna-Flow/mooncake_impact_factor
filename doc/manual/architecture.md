# Architecture

`mooncake_impact_factor` is a MoonBit module inside a larger application. The
MoonBit packages define the score rules, the search query language, its SQL
compilation and the static search engine; Python builds the data; a Next.js
application serves it, either dynamically from SQLite or as static files. This guide follows the data from the registry to
the browser and names the file responsible for each step.

## Components

| Component | Path | Language | Role |
| --- | --- | --- | --- |
| `score` | `src/score` | MoonBit | Score, rank and momentum rules ([API](api/score.md)). |
| `cli` | `src/cli` | MoonBit (JS) | Command that evaluates a score snapshot for other languages ([API](api/cli.md)). |
| `query` | `src/query` | MoonBit | Query tree, expression parser and serializer, flat parameters, labels, sort keys, paging ([API](api/query.md)). |
| `query_sql` | `src/query_sql` | MoonBit | Search requests to SQLite `WHERE`/`ORDER BY`/paging plans ([API](api/query_sql.md)). |
| `static_search` | `src/static_search` | MoonBit | Static search engine: evaluation, relevance, sorting, paging ([API](api/static_search.md)). |
| Index builder | `scripts/build_index.py` | Python | Reads the registry, writes the SQLite database. |
| Static exporter | `scripts/export_static_json.py` | Python | Writes `public/data/**` from the database. |
| MoonBit bridge | `scripts/build_moonbit.mjs`, `lib/query.ts`, `lib/static-search.ts` | JavaScript, TypeScript | Builds `query`, `query_sql` and `static_search` to ES modules in `lib/moonbit/` and wraps them with TypeScript types. |
| Web application | `app`, `frontend/src`, `lib/data.ts`, `web` | TypeScript | Pages, route handlers, database access, the static search worker and the stylesheets. |

## From registry to scores

`scripts/build_index.py` rebuilds the database from scratch on every run.

1. **Read the registry.** Every line of every `*.index` file under
   `~/.moon/registry/index/user` is one published version: name, version,
   creation time, metadata and dependencies. `moon update` refreshes this
   local copy; the ranking covers exactly the packages in it.
2. **Choose the latest version** of each package by creation time, then by
   semantic version. Its description, keywords, repository and license
   describe the package.
3. **Collect downloads.** Unless `--skip-mooncakes-downloads` is given, the
   builder asks `https://mooncakes.io/api/v0/manifest/<package>` for each
   package not yet in `data/download_cache.json`, with eight threads, and
   stores the answers in the cache. `--downloads-json` overrides individual
   counts. Unknown counts are `0`.
4. **Build edges.** For every version that depends on another package of the
   snapshot, the builder records a package-level edge from the dependent to
   the dependency. Self-dependencies are ignored. `first_seen_at` is the
   creation time of the earliest version of the dependent that uses the
   dependency.
5. **Count signals.** With $\tau$ the build time, a package's signals are

   | Signal | Definition |
   | --- | --- |
   | `dependents` | Number of edges into the package. |
   | `recent_dependents` | Edges with `first_seen_at` $\ge \tau - 180$ days. |
   | `downloads` | The collected download count. |
   | `days_since_release` | Whole days from the latest release to $\tau$; `3650` when the date is unknown. |
   | `historical_dependents` | Edges with `first_seen_at` $\le \tau - 30$ days. |
   | `historical_recent_dependents` | Edges with `first_seen_at` in $[\tau - 210, \tau - 30]$ days. |
   | `historical_downloads` | Always `0`; the registry has no download history. |
   | `historical_days_since_release` | `days_since_release` $- 30$ when the latest release is at least 30 days old, else `0`; `3650`, like the current value, when the release date is unknown. |

   The historical window is the recent window shifted 30 days back, so the
   two snapshots are computed the same way, with one exception: downloads
   have no history, so the whole download term counts as growth. A package
   whose release date is unknown gets the multiplier $0.88$ in both
   snapshots, so unchanged counts give zero growth.
6. **Score.** For each package the builder runs the [`cli`](api/cli.md)
   command with these eight signals and stores the returned snapshot in the
   `package_scores` table. The score rules therefore live only in
   [`src/score`](api/score.md).
7. **Index text.** An SQLite FTS5 table holds full name, owner, package name,
   description and keywords for full-text search.

The database tables are `packages`, `versions`, `dependencies`,
`package_edges`, `package_scores` and `search_index`.

## Serving

### Dynamic mode

`npm run dev` or `npm run start` with `MOONCAKE_DB_PATH` serves pages and
JSON route handlers backed by the database:

| Route | Returns |
| --- | --- |
| `GET /api/feeds/top?limit=<n>` | Packages by score descending, then name. |
| `GET /api/feeds/hot?limit=<n>` | `Hot` packages by 30-day growth, then score, then name. |
| `GET /api/feeds/rising?limit=<n>` | `Rising` packages, ordered like `hot`. |
| `GET /api/search?...` | `{ "items": [...], "total": n }`: one page of package summaries (`limit` 50 by default, at most 200, from `offset`) and the number of matches. |
| `GET /api/packages/<owner>/<package>/analysis` | `{ "detail": ..., "dependents": [...] }`. |

The [getting started guide](getting_started.md#3-query-the-apis) lists the
search parameters. `lib/data.ts` passes them to `plan_search` of
[`query_sql`](api/query_sql.md), which validates them and returns the
`FROM`, `WHERE`, `ORDER BY` and paging of the statement; queries in the
`ast` or `expr` parameters become `WHERE` clauses, text terms use FTS5. A
request without criteria lists every package by rank position.

### Static mode

`npm run build:static-data` runs the index builder and then
`scripts/export_static_json.py`, which writes the feeds, a search index, one
file per package and a manifest to `public/data`. `npm run build:static`
builds the MoonBit modules and runs `next build --webpack` with
`NEXT_PUBLIC_APP_MODE=static`, which exports the site to `out/` without
route handlers. In the browser, feeds and package pages are plain file
fetches and search runs in a Web Worker that calls the `static_search`
engine compiled to JavaScript; the
[static_search design](design/static_search.md) describes it.

### MoonBit modules in the web code

`scripts/build_moonbit.mjs` runs
`moon build src/query src/query_sql src/static_search --target js --release`
and copies each generated ES module, with its `.d.ts` files, to
`lib/moonbit/<package>/` (ignored by git). npm runs it before `dev`,
`build`, `typecheck` and `test` (`npm run build:moonbit` runs it alone).
The modules exchange JSON strings: `lib/query.ts` wraps `query`,
`lib/data.ts` calls `query_sql`, and `lib/static-search.ts` wraps
`static_search` for the worker. The
`deploy-static` workflow rebuilds and publishes this site daily.

## Where the rules live

Every rule has one owner, and the others call it:

| Rule | Owner |
| --- | --- |
| Score, rank and momentum | `src/score` (called through `src/cli`) |
| Signal definitions and time windows | `scripts/build_index.py` |
| Query language, flat parameters, labels, sort keys, paging | `src/query` |
| SQL compilation, parameter validation and dynamic ordering | `src/query_sql` |
| Static evaluation, relevance and ordering | `src/static_search` |

`scripts/build_index.py` still contains Python functions `compute_score` and
`compute_momentum_label` that mirror the MoonBit rules; the build does not
call them.
