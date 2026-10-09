# Architecture

`mooncake_impact_factor` is a MoonBit module inside a larger application. The
MoonBit packages define the registry signals, the score rules, the search
query language, its SQL compilation and the static search engine; Python
moves the data; a Next.js
application serves it, either dynamically from SQLite or as static files. This guide follows the data from the registry to
the browser and names the file responsible for each step.

## Components

| Component | Path | Language | Role |
| --- | --- | --- | --- |
| `score` | `src/score` | MoonBit | Score, grade and momentum rules, rank positions ([API](api/score.md)). |
| `metrics` | `src/metrics` | MoonBit | Latest releases, current dependency edges, signals now and 30 days ago, and the scores of the whole registry ([API](api/metrics.md)). |
| `cli` | `src/cli` | MoonBit (JS) | `build-index` command that runs `metrics` on a registry file for the index builder ([API](api/cli.md)). |
| `query` | `src/query` | MoonBit | Query tree, expression parser and serializer, flat parameters, labels, sort keys, paging ([API](api/query.md)). |
| `query_sql` | `src/query_sql` | MoonBit | Search requests to SQLite `WHERE`/`ORDER BY`/paging plans ([API](api/query_sql.md)). |
| `static_search` | `src/static_search` | MoonBit | Static search engine: evaluation, relevance, sorting, paging ([API](api/static_search.md)). |
| Index builder | `scripts/build_index.py` | Python | Reads the registry, fetches downloads, runs `cli build-index`, writes the SQLite database. |
| Static exporter | `scripts/export_static_json.py` | Python | Writes `public/data/**` from the database. |
| MoonBit bridge | `scripts/build_moonbit.mjs`, `lib/query.ts`, `lib/static-search.ts` | JavaScript, TypeScript | Builds `query`, `query_sql` and `static_search` to ES modules in `lib/moonbit/` and wraps them with TypeScript types. |
| Web application | `app`, `frontend/src`, `lib/data.ts`, `web` | TypeScript | Pages, route handlers, database access, the static search worker and the stylesheets. |
| Interface strings | `web/i18n`, `scripts/i18n.mjs` | JSON, gettext | English strings and their zh_CN and ja_JP catalogs, compiled to `frontend/src/generated/strings.json`. |

## From registry to scores

`scripts/build_index.py` rebuilds the database from scratch on every run. It
only moves data; every decision that changes a score is made by the MoonBit
`metrics` and `score` packages.

1. **Read the registry.** Every line of every `*.index` file under
   `~/.moon/registry/index/user` is one published version: name, version,
   creation time, yanked flag, metadata and dependencies. `moon update`
   refreshes this local copy; the ranking covers exactly the packages in it.
2. **Collect downloads.** Unless `--skip-mooncakes-downloads` is given, the
   builder asks `https://mooncakes.io/api/v0/manifest/<package>` for each
   package with eight threads. Without `--refresh-downloads` it reuses the
   counts in `data/download_cache.json` and fetches only missing ones.
   `--downloads-json` overrides individual counts.
3. **Keep a download history.** Freshly fetched counts are appended to
   `data/download_history.json`, one snapshot per day, and snapshots older
   than 45 days are dropped. The deployment keeps this file between runs in
   the GitHub Actions cache.
4. **Compute.** The builder writes the releases (name, version, date,
   dependency names, yanked), the downloads and the history to a temporary
   JSON file and runs `cli build-index` once. The command returns, for every
   package, the latest release, the current dependency edges, external and
   same-owner dependents, distinct dependent owners, recent dependents, the
   signals 30 days ago, the score, the rank position, the grade, the
   momentum label and the score breakdown; and for the registry the
   population, the top score and the label counts. The
   [metrics design](design/metrics.md) defines the signals and the
   [score design](design/score.md) the rules.
5. **Write SQLite.** The report goes unchanged into the tables `packages`,
   `versions` (with the release order that MoonBit computed and the yanked
   flag), `dependencies`, `package_edges` (current edges with their first
   appearance and ownership), `package_scores` and `index_meta`, and an
   SQLite FTS5 table `search_index` holds full name, owner, package name,
   description and keywords for full-text search.

## Serving

### Dynamic mode

`npm run dev` or `npm run start` with `MOONCAKE_DB_PATH` serves pages and
JSON route handlers backed by the database:

| Route | Returns |
| --- | --- |
| `GET /api/feeds/top?limit=<n>` | Packages by rank position, then name. |
| `GET /api/feeds/rising?limit=<n>` | `Rising` packages by 30-day change, then score, then name. |
| `GET /api/feeds/new?limit=<n>` | `New` packages by score, then name. |
| `GET /api/search?...` | `{ "items": [...], "total": n }`: one page of package summaries (`limit` 50 by default, at most 200, from `offset`) and the number of matches. |
| `GET /api/packages/<full name>` | `{ "detail": ..., "dependents": [...], "dependencies": [...] }`; the full name may have more than two segments. |
| `GET /api/meta` | When the index was computed, its population, the top score, the label counts and whether download history was used. |

The pages live under one segment per language, as on the documentation
site: `/en/`, `/zh-cn/` and `/ja/` are the rankings, `/<lang>/package/?name=<full name>`
a package and `/<lang>/method/` the explanation of the score. `/` picks the
reader's stored choice (`lf-lang`), then the browser's languages, then
English; `/search` and `/advanced-search` from version 0.1 redirect with
their filters.

The [getting started guide](getting_started.md#3-query-the-apis) lists the
search parameters. `lib/data.ts` passes them to `plan_search` of
[`query_sql`](api/query_sql.md), which validates them and returns the
`FROM`, `WHERE`, `ORDER BY` and paging of the statement; queries in the
`ast` or `expr` parameters become `WHERE` clauses, text terms use FTS5. A
request without criteria lists every package by rank position.

### Static mode

`npm run build:static-data` runs the index builder and then
`scripts/export_static_json.py`, which writes the feeds, a search index, one
file per package (`owner--name.json`, with every `/` of the full name
replaced by `--`) and a manifest with the index metadata to `public/data`. `npm run build:static`
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

## Interface strings

The interface is localised the way the documentation site localises its own.
English strings by key live in `web/i18n/conf.json`, translations in
`web/i18n/locale/<locale>/LC_MESSAGES/app.po`, and the locales in
`web/i18n/locales.json`, a copy of the site's `config/locales.json`.
`node scripts/i18n.mjs update` regenerates `app.pot` and merges it into
every catalog with lunadoc's msgmerge semantics, `check` fails when a
catalog is behind or a translation drops a `{placeholder}`, and `compile`
writes the table that `t(lang, key, vars)` reads; npm runs `compile` before
`dev`, `build`, `typecheck` and `test`.

## Where the rules live

Every rule has one owner, and the others call it:

| Rule | Owner |
| --- | --- |
| Latest release, current dependencies, signals and time windows | `src/metrics` (called through `src/cli`) |
| Score, grades, rank positions and momentum; the label lists | `src/score` |
| Query language, flat parameters, sort keys, paging | `src/query` |
| SQL compilation, parameter validation and dynamic ordering | `src/query_sql` |
| Static evaluation, relevance and ordering | `src/static_search` |

Python and TypeScript contain no copy of these rules.
