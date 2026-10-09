# Changelog

All notable changes to `Luna-Flow/mooncake-impact-factor` are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Fixed

- `cli build-index` reports an unreadable input file as a JSON error instead
  of leaking a Node.js `ENOENT` stack trace.

## 0.2.0 - 2026-10-09

Scoring v2, the computation of the registry signals and the whole search
in MoonBit, and a web interface rebuilt after the Luna-Flow documentation
site. This release breaks the MoonBit API of `score` and `cli`, the HTTP
routes of the analysis and the hot feed, and the static data schema.

### Changed (scoring)

- **Dependents come from the latest release.** A dependent is a package
  whose latest non-yanked release declares the dependency; version 0.1
  counted every package that had ever declared it in any release.
- **Dependents of the same owner count a quarter.** `Signals` separates
  external from same-owner dependents, and `SELF_DEPENDENT_WEIGHT` is `1/4`.
  In the registry of June 2026, 48 % of the dependency edges connected
  packages of one owner.
- **Grades are shares of the registry.** `S`, `A`, `B`, `C` and `D` are the
  top 5 %, 15 %, 35 %, 65 % and the rest by competition position
  (`rank_positions`, `rank_label(position, population, score)`); a package
  without any signal is always `D`. Version 0.1 used fixed thresholds on the
  score.
- **Momentum is `New`, `Rising`, `Stable` or `Cooling`.** `New` has no
  release 30 days ago; `Rising` and `Cooling` need a change of at least 10
  points and 10 % of the earlier score. `Hot` is removed.
- **The 30-day growth no longer counts every download.** Version 0.1 scored
  the past with zero downloads, so the whole download term counted as growth
  and almost every popular package was `Rising`. The past now uses a
  download snapshot from about 30 days ago, or today's counts when none is
  recorded yet.
- **The release-recency multiplier is continuous:** `1.12` up to 30 days,
  falling linearly to `0.88` at 365 days, instead of steps that changed a
  score by up to 6.4 % overnight.
- **The score is the same on every backend.** `ln` ports FreeBSD msun
  `e_log.c` with IEEE 754 basic operations only, instead of `@math.ln`,
  which uses `Math.log` on js.
- `score_population` scores a registry and returns `ScoreSnapshot` with
  `rank_position` and a `ScoreBreakdown` of the three terms; `rank_labels`
  and `momentum_labels` are the only lists of labels.

### Added

- MoonBit package `metrics`: latest releases (by date, then SemVer 2.0.0
  precedence), current dependency edges with their first appearance and
  ownership, external, same-owner and recent dependents, distinct dependent
  owners, the signals 30 days ago, release order, label counts and the
  scores of the whole registry, with an RFC 3339 parser.
- MoonBit package `query`: the search query language (query tree, JSON
  form, expression parser and serializer, flat-parameter derivation), the
  sort keys and the paging rules. It was TypeScript in `lib/query.ts`, which
  now wraps the generated JavaScript.
- MoonBit package `query_sql`: compiles query trees and `/api/search`
  requests (validation, FTS5 expressions, ordering, paging) to SQLite
  statements. It replaces the compiler in `lib/data.ts`.
- `cli build-index --input <path> [--output <path>]` scores the whole
  registry in one process.
- Query fields `external_dependents`, `owners`, `age` and `position`, the
  parameters `min_external_dependents`, `min_owners` and `max_age`, the sort
  keys `external`, `owners`, `position` and `age`, and lists in `rank` and
  `momentum` (`rank=S,A`).
- Searches accept `limit` (default 50, at most 200) and `offset` and return
  `{ items, total }`, on the server and in the static worker.
- `GET /api/meta`, `GET /api/feeds/new`, and the dependencies of the latest
  release in the package analysis.
- `build_index.py --refresh-downloads` refetches every count and records it
  in `data/download_history.json` (45 days); `--now` scores the registry as
  of another moment. The deployment keeps the history in the Actions cache.
- Web interface, rebuilt after the Luna-Flow documentation site with its
  tokens and page chrome copied unchanged:
  - the rankings are the home page: one sortable table of every package
    (position, grade, dependents, owners, 30-day change, release age,
    downloads, score) with filters in the sidebar and every view in the URL;
  - every package has a page: standing, where the score comes from, the last
    30 days, dependents with ownership, dependencies, releases;
  - a page explains how scores work, and the site's search dialog (`/`,
    `Ctrl+K`) searches packages;
  - the layout works down to 375 px in light and dark themes.
- Localisation as on the documentation site: pages under `/en/`, `/zh-cn/`
  and `/ja/`, `/` choosing the stored, then the browser language, and
  interface strings in gettext catalogs (`web/i18n`) handled by
  `scripts/i18n.mjs` with lunadoc's msgmerge semantics. Chinese and Japanese
  are complete.

### Changed

- `build_index.py` only moves data; it runs `cli` once instead of once per
  package (about one second for 2902 packages), and Python and TypeScript
  no longer contain copies of the rules or a SemVer sort.
- `static_search` is the search engine of the static site (index loading,
  evaluation, relevance, sorting, paging), builds for every target, and
  lower-cases and collates text with its own tables instead of the host's
  `toLowerCase` and `localeCompare`. `runtime_version` is
  `"static-search-v2"`.
- A search without criteria lists every package ordered by rank position
  and honours `sort` and `order`, instead of returning the top feed. Ties of
  every sort key are broken by rank position, then by name.
- Static data schema 2: summaries carry the new signals; package files are
  named `owner--name.json` with every `/` replaced, so nested names such as
  `tonyfettes/tree-sitter/cli` work; feeds are `top`, `rising` and `new`.
- The package analysis moved to `GET /api/packages/<full name>`.
- `/search` and `/advanced-search` redirect to the rankings with their
  filters. The graphical query builder is replaced by a query expression
  field with live validation.
- Migrated to MoonBit 0.10 (`moonc` 0.10 or later): `moon.mod` sets
  `source = "src"` and `preferred_target = "js"`, `cli` is a
  `pkgtype(kind: "executable")`, and the generated `pkg.generated.mbti`
  files are committed.
- The daily deployment runs at 00:00 Japan time.

### Removed

- `compute_score(Int, Int, Int, Int)`, `rank_label(Double)`,
  `compute_momentum_label(Double, Double, Double, Int)` and
  `compute_score_snapshot`; use `Signals`, `compute_score`, `rank_label`,
  `compute_momentum_label` and `score_population`.
- `cli score-snapshot`; use `cli build-index`.
- The momentum label `Hot`, the `hot` feed and
  `GET /api/packages/<owner>/<package>/analysis`.
- The landing page, the animations (gsap) and the icon library.

### Fixed

- The static search worker runs again: Turbopack copied the worker's
  TypeScript source as a static asset instead of bundling it.
- `serialize` keeps the parentheses of a negated group and quotes values
  with a colon or a keyword, so displayed expressions parse back.
- An unclosed quote in an expression is a syntax error.
- `sort=constructor` and malformed `ast` or `expr` parameters are answered
  with HTTP 400 instead of invalid SQL or HTTP 500.
- Negated terms add no relevance to the static order (#4).
- Unknown release dates give the same age now and 30 days ago (#5).
- A failed request no longer leaves earlier results on screen.

### Documentation

- API, tutorial and design pages for all six packages; the score design
  derives the same-owner discount, the relative grades and the momentum
  thresholds, the metrics design defines the signals. The architecture and
  getting-started guides describe the new pipeline, routes and
  localisation. zh_CN and ja_JP translations are updated.

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
