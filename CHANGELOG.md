# Changelog

All notable changes to `Luna-Flow/mooncake-impact-factor` are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Changed

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

### Deprecated

- The methods `ScoreSnapshot::to_json`, `ScoreSnapshot::from_json` and
  `ScoreSnapshot::to_repr`, which earlier compilers created implicitly from
  the derived traits, are kept through explicit, hidden and deprecated
  promotions in `src/score/extends.mbt`. Use `Json(s)`,
  `@json.from_json(json)` and `Repr(s)` instead.

### Documentation

- Documentation rewritten: API, tutorial and design pages for `score`, `cli`
  and `static_search`, a new architecture guide, and complete zh_CN and ja_JP
  translations.
- The README describes only the current version; this changelog was added.

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
