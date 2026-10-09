# mooncake_impact_factor

This manual documents version `v0.2.0` of `Luna-Flow/mooncake-impact-factor`.

## Overview

`mooncake_impact_factor` ranks the packages of the MoonBit registry by how
much the ecosystem relies on them. It counts the packages whose latest
release depends on each package (those of other owners fully, those of the
same owner at a quarter), the recent ones among them, downloads and release
age; it places every package in the registry by position, grade and 30-day
momentum, and lets you search, filter and compare the result in a web
application, at <https://impact-factor.lunaflow.cn>, that runs locally
against SQLite or as a static site.

The MoonBit module owns the rules: the registry signals live in `metrics`,
the score, grades and momentum in `score`, the search query language in
`query`, its SQL compilation in `query_sql` and the static site's search
engine in `static_search`. The rest of the repository calls them and is not
MoonBit: the Python index builder and
static exporter in `scripts/`, and the Next.js application in `app/`,
`frontend/src/` and `lib/`. The [architecture guide](architecture.md) shows
how they fit together.

## Install

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

Then import the package you need in your `moon.pkg`, for example
`"Luna-Flow/mooncake-impact-factor/score"`. `score`, `metrics`, `query`,
`query_sql` and `static_search` build for every target, and `score` gives
the same bits on every backend; `cli` builds only for the
JavaScript target. The module
needs the MoonBit toolchain 0.10 or later (`moonc` ≥ 0.10). Running `cli`
and the web application also needs Node.js 20.16, 22.3 or later, and the
index builder needs Python 3.

## Pages

The MoonBit module has six packages, each with a tutorial, an API
reference and a design page. Three guides cover the rest of the repository.

| Part | Tutorial | API | Design |
| --- | --- | --- | --- |
| `score`: impact score, grades, rank positions, momentum, breakdown | [tutorial](tutorial/score.md) | [API](api/score.md) | [design](design/score.md) |
| `metrics`: registry signals now and 30 days ago, scored population | [tutorial](tutorial/metrics.md) | [API](api/metrics.md) | [design](design/metrics.md) |
| `cli`: the `build-index` command that runs `metrics` on a registry file | [tutorial](tutorial/cli.md) | [API](api/cli.md) | [design](design/cli.md) |
| `query`: query language, query tree, flat parameters, labels, sort keys | [tutorial](tutorial/query.md) | [API](api/query.md) | [design](design/query.md) |
| `query_sql`: search requests compiled to SQLite statements | [tutorial](tutorial/query_sql.md) | [API](api/query_sql.md) | [design](design/query_sql.md) |
| `static_search`: the static site's search engine | [tutorial](tutorial/static_search.md) | [API](api/static_search.md) | [design](design/static_search.md) |
| Guide: build the database, run the application, query its HTTP API | [getting started](getting_started.md) | | |
| Guide: the data pipeline from the registry to the browser | | | [architecture](architecture.md) |
| Guide: documentation rules of this repository | | | [conventions](conventions.md) |

## Exported items

- `score`: `Signals`, `compute_score`, `score_breakdown`,
  `activity_multiplier`, `weighted_dependents`, `log_signal`, `ln`,
  `rank_positions`, `rank_label`, `compute_momentum_label`,
  `score_population`, `ScoreSnapshot`, `ScoreBreakdown`, the label lists
  and the constants of the model
- `metrics`: `Input`, `Release`, `DownloadSnapshot`, `compute`, `Report`,
  `PackageReport`, `Edge`, `MetricsError`, and the helpers
  `parse_timestamp`, `format_timestamp`, `days_between`,
  `compare_versions`, `compare_text`, `owner_of`
- `query`: the query tree (`Group`, `Term`, `Node`, `Field`, `Operator`,
  `GroupOp`), `parse_expression`, `serialize`, `validate`, `encode`,
  `decode`, `derive_ast` and the other flat-parameter functions, the label
  sets, `SortKey`, `page_limit`, `page_offset`, `number_value`, `trim`, and
  string-based exports for JavaScript
- `query_sql`: `compile_ast`, `plan_search`, `resolve_order_by`,
  `compile_fts_expression` and their helpers
- `static_search`: `parse_index`, `evaluate`, `relevance`, `search_items`,
  `sort_indices`, `normalize_text`, `collate`, `runtime_version`, and the
  JavaScript exports `load_index` and `search`
- `cli`: no MoonBit names; its interface is the command
  `build-index --input <path> [--output <path>]`

## Where to read next

The [score tutorial](tutorial/score.md) computes, ranks and explains scores,
the [score API](api/score.md) lists every function and threshold, and the
[score design](design/score.md) derives the formula, the grades and the
momentum rules; the [metrics design](design/metrics.md) defines the signals.

- New to the project: follow [getting started](getting_started.md) to build
  the database and open the web application, then read the
  [score tutorial](tutorial/score.md) to understand what the numbers mean.
- Using the score in a library: keep the [score API](api/score.md) at hand,
  and the [metrics tutorial](tutorial/metrics.md) to score a registry of
  your own; use the [cli tutorial](tutorial/cli.md) when the caller is not
  MoonBit.
- Contributing: read the [score design](design/score.md), the
  [query design](design/query.md) for the search language, the
  [static_search design](design/static_search.md) for the browser index and
  its ranking, and the [architecture guide](architecture.md) for how the
  signals are counted. The repository's `CONTRIBUTING.md` lists the checks to
  run.

## Validation

Recommended release checks:

```bash
moon check src/score src/metrics --target all
moon check src/query src/query_sql src/static_search --target all
moon check src/cli --target js
moon test src/score src/metrics --target all
moon test src/query src/query_sql src/static_search --target all
```

`CONTRIBUTING.md` adds the Python, TypeScript and static-site checks.

The rankings come from a local copy of the registry index plus optional
download counts from mooncakes.io. They are not an authoritative ranking of
the MoonBit ecosystem, and they change whenever the database is rebuilt from
a newer snapshot.
