# Architecture

`mooncake_impact_factor` is a MoonBit module inside a larger application. The
MoonBit packages define the score rules and small JavaScript helpers; Python
builds the data; a Next.js application serves it, either dynamically from
SQLite or as static files. This guide follows the data from the registry to
the browser and names the file responsible for each step.

## Components

| Component | Path | Language | Role |
| --- | --- | --- | --- |
| `score` | `src/score` | MoonBit | Score, rank and momentum rules ([API](api/score.md)). |
| `cli` | `src/cli` | MoonBit (JS) | Command that evaluates a score snapshot for other languages ([API](api/cli.md)). |
| `static_search` | `src/static_search` | MoonBit (JS) | Version tag and text normalisation for the static mode ([API](api/static_search.md)). |
| Index builder | `scripts/build_index.py` | Python | Reads the registry, writes the SQLite database. |
| Static exporter | `scripts/export_static_json.py` | Python | Writes `public/data/**` from the database. |
| Query layer | `lib/query.ts`, `lib/data.ts` | TypeScript | Query AST, expression parser, SQL compilation. |
| Web application | `app`, `frontend/src` | TypeScript | Pages, route handlers and the static search worker. |

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
   | `historical_days_since_release` | `days_since_release` $- 30$ when the latest release is at least 30 days old, else `0`; also `0` when the release date is unknown. |

   The historical window is the recent window shifted 30 days back, so the
   two snapshots are computed the same way, with two exceptions. Downloads
   have no history, so the whole download term counts as growth. A package
   whose release date is unknown gets the multiplier $0.88$ now
   ($t = 3650$) but $1.12$ for 30 days ago ($t = 0$). With the same
   counts in both windows and no downloads, its `score_30d_ago` is
   $1.12 / 0.88 \approx 1.27$ times its current score, and its growth is
   negative.
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
| `GET /api/search?...` | `{ "items": [...] }`, at most 100 package summaries. |
| `GET /api/packages/<owner>/<package>/analysis` | `{ "detail": ..., "dependents": [...] }`. |

The [getting started guide](getting_started.md#3-query-the-apis) lists the
search parameters. Queries in the `ast` or `expr` parameters are compiled to
SQL `WHERE` clauses; text terms use FTS5.

### Static mode

`npm run build:static-data` runs the index builder and then
`scripts/export_static_json.py`, which writes the feeds, a search index, one
file per package and a manifest to `public/data`. `npm run build:static`
compiles `static_search` and runs `next build` with
`NEXT_PUBLIC_APP_MODE=static`, which exports the site to `out/` without
route handlers. In the browser, feeds and package pages are plain file
fetches and search runs in a Web Worker; the
[static_search design](design/static_search.md) describes it. The
`deploy-static` workflow rebuilds and publishes this site daily.

## Where the rules live

Every rule has one owner, and the others call it:

| Rule | Owner |
| --- | --- |
| Score, rank and momentum | `src/score` (called through `src/cli`) |
| Signal definitions and time windows | `scripts/build_index.py` |
| Query language and AST | `lib/query.ts` |
| SQL compilation and dynamic ordering | `lib/data.ts` |
| Static evaluation and ordering | `frontend/src/static-search.worker.ts` |

`scripts/build_index.py` still contains Python functions `compute_score` and
`compute_momentum_label` that mirror the MoonBit rules; the build does not
call them.
