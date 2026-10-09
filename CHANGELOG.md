# Changelog

All notable changes to `Luna-Flow/mooncake-impact-factor` are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- New MoonBit package `query`: the search query language (query tree, JSON
  form, expression parser and serializer, flat-parameter derivation), the
  rank and momentum label sets, the sort keys and the paging rules. It was
  TypeScript in `lib/query.ts`, which now wraps the generated JavaScript.
- New MoonBit package `query_sql`: compiles query trees and `/api/search`
  requests (validation, FTS5 expressions, ordering, paging) to SQLite
  statements. It replaces the compiler in `lib/data.ts`.
- `scripts/build_moonbit.mjs` (`npm run build:moonbit`) builds `query`,
  `query_sql` and `static_search` to ES modules in `lib/moonbit/`; npm runs
  it before `dev`, `build`, `typecheck` and `test`.
- Query fields `external_dependents`, `owners`, `age` and `position`, the
  flat parameters `min_external_dependents`, `min_owners` and `max_age`
  (`minExternalDependents`, `minOwners`, `maxAge` in the interface state),
  and the sort keys `external`, `owners`, `position` and `age`.
- `rank` and `momentum` accept comma-separated lists (`rank=S,A`), which
  match any of the labels.
- Searches accept `limit` (default 50, at most 200) and `offset`, and
  return `{ items, total }` with the number of matches before paging, on
  the server (`/api/search`) and in the static worker.

### Changed

- `static_search` is now the search engine of the static site (index
  loading, evaluation, relevance, sorting, paging) instead of a version tag
  and a lower-casing helper. It builds for every target, lower-cases and
  collates text with its own tables instead of the host's `toLowerCase` and
  `localeCompare`, and exports `load_index` and `search` for the worker.
  `runtime_version` is now `"static-search-v2"`.
- The momentum labels are `New`, `Rising`, `Stable` and `Cooling`; `Hot` is
  no longer accepted in queries.
- A search without criteria lists every package (paged), ordered by rank
  position and honouring `sort` and `order`, instead of returning the top
  feed.
- The default sort without a text query is `position` (ascending). Ties of
  every sort key are broken by rank position and then by name, whatever the
  direction; `order` flips only the key. This applies to the server and the
  static site alike.
- Malformed `ast` or `expr` parameters are answered with HTTP 400 and the
  parser's message instead of HTTP 500.
- The static rank and momentum terms ignore case and surrounding spaces
  (`rank=a` matches rank `A`), as on the server.
- The static site is built with webpack (`next build --webpack`).

- Migrated to MoonBit 0.10 (`moonc` 0.10 or later is required).
- `moon.mod` sets `source = "src"` directly instead of through `options(...)`,
  and declares `preferred_target = "js"`.
- `cli` is declared with `pkgtype(kind: "executable")` instead of the legacy
  `"is-main"` option. `cli` and `static_search` declare
  `supported_targets = "js"`, because they use JavaScript foreign functions.
- Unused `moonbitlang/core` imports were removed from the package manifests.
- The JavaScript foreign functions in `cli` and `static_search` annotate their
  `String` parameters with `#borrow`.
- `cli` serialises snapshots with `Json(...)` instead of the deprecated
  `to_json` method. The output is unchanged.
- Blackbox tests call the packages under test with qualified names
  (`@score.compute_score`, `@static_search.runtime_version`).
- The generated interface files `pkg.generated.mbti` are now committed for all
  three packages.

- The web application was restyled after the Luna-Flow documentation site
  (lunaflow.cn). The stylesheets in `web/` are split into `tokens.css`,
  `base.css` and one file per screen, and use the colour, type, spacing and
  radius tokens of the documentation site, with light and dark themes that
  follow `prefers-color-scheme` until a theme is chosen. The header is a
  sticky hairline bar with the Luna-Flow logo, links to the manual and the
  repository, and the current page underlined in the accent. Rankings are
  rows with a score bar instead of boxed cards, rank and momentum labels have
  their own colours, and the package analysis sits in a margin column. The
  layout has no horizontal scroll down to 375 px.
- An explicit theme choice is applied before the first paint, and the pages
  have a skip link and a footer.

### Deprecated

- The methods `ScoreSnapshot::to_json`, `ScoreSnapshot::from_json` and
  `ScoreSnapshot::to_repr`, which earlier compilers created implicitly from
  the derived traits, are kept through explicit, hidden and deprecated
  promotions in `src/score/extends.mbt`. Use `Json(s)`,
  `@json.from_json(json)` and `Repr(s)` instead.

### Fixed

- The static search worker runs again: Turbopack copied the worker's
  TypeScript source as a static asset instead of bundling it, so the
  browser could not start it.
- `serialize` keeps the parentheses of a negated group (`NOT (a OR b)` was
  written `NOT a OR b`) and quotes values with a colon or a keyword
  (`repository:"https://x"`, `owner:"and"`), so expressions shown in the
  interface parse back to the same query.
- An unclosed quote in an expression (`owner:"gml`) is a syntax error
  instead of silently ending the value at the end of the text.
- `sort=constructor` (or another inherited object property) is rejected
  with HTTP 400 instead of producing invalid SQL.

- The static search no longer counts negated terms in its relevance order:
  a term under `NOT`, directly or through a negated group, adds no
  relevance, so `NOT rank=D OR json` no longer ranks the rank-`D` packages
  first (#4). The query evaluation now lives in `src/static_search`.
- `scripts/build_index.py` uses the same days since release, `3650`, for
  the current and the 30-days-ago snapshot when the release date is unknown.
  Before, the historical value was `0`, so such packages got the multiplier
  `1.12` 30 days ago and `0.88` now and always showed negative growth (#5).
- Opening the advanced search dialog from the search page no longer crashes
  the page: a hook in the dialog ran only while it was open, which changed
  the hook order between renders.

### Documentation

- Documentation rewritten: API, tutorial and design pages for `score`, `cli`
  and `static_search`, a new architecture guide, and complete zh_CN and ja_JP
  translations.
- The README describes only the current version; this changelog was added.
- The manual follows the luna-generic layout: an overview with install,
  pages, exported items, reading paths and validation sections; purpose and
  importing sections on the API pages; task tables and `inspect`-checked
  examples in the tutorials. The design pages now derive the smallest
  positive score, why the recency multiplier crosses at most one rank
  boundary, and why negated terms add no static relevance; they list every
  difference between static and server search. The pages describe the
  fixes of #4 and #5.

## 0.1.2

- Local registry ingestion from `~/.moon/registry/index/user` into SQLite:
  packages, versions, dependencies, package edges, score snapshots and an
  FTS5 search index, rebuilt from scratch on every build.
- Score, rank and momentum rules in the MoonBit `score` package, evaluated by
  the index builder through the `cli` bridge.
- Download counts from mooncakes.io with a local cache and an override file.
- Next.js application with ranked feeds, full-text search with boolean
  syntax and field prefixes, a graphical advanced query builder, a shared
  query AST for `ast`, `expr` and legacy parameters, and per-package
  analysis pages.
- Static publishing mode with exported JSON data, a browser search worker and
  a scheduled GitHub Pages deployment.
