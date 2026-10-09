# mooncake_impact_factor

This manual documents version `v0.1.2` of `Luna-Flow/mooncake-impact-factor`.

## Overview

`mooncake_impact_factor` ranks the packages of the MoonBit registry by how
much the ecosystem relies on them. It scores every package from its
dependents, recent dependents, downloads and release date, labels the score
with a rank and a momentum class, and lets you search and filter the result
in a web application that runs locally against SQLite or as a static site.

The MoonBit module owns the rules: the score formula, the rank thresholds
and the momentum classes live in `score`; the search query language lives in
`query`, its SQL compilation in `query_sql` and the static site's search
engine in `static_search`. The rest of the repository calls them. The rest is not MoonBit: the Python index builder and
static exporter in `scripts/`, and the Next.js application in `app/`,
`frontend/src/` and `lib/`. The [architecture guide](architecture.md) shows
how they fit together.

## Install

```bash
moon add Luna-Flow/mooncake-impact-factor@0.1.2
```

Then import the package you need in your `moon.pkg`, for example
`"Luna-Flow/mooncake-impact-factor/score"`. `score`, `query`, `query_sql`
and `static_search` build for every target; `cli` builds only for the
JavaScript target. The module
needs the MoonBit toolchain 0.10 or later (`moonc` ≥ 0.10). Running `cli`
and the web application also needs Node.js 20.16, 22.3 or later, and the
index builder needs Python 3.

## Pages

The MoonBit module has five packages, each with a tutorial, an API
reference and a design page. Three guides cover the rest of the repository.

| Part | Tutorial | API | Design |
| --- | --- | --- | --- |
| `score`: impact score, rank and momentum labels, snapshots | [tutorial](tutorial/score.md) | [API](api/score.md) | [design](design/score.md) |
| `cli`: a JavaScript command that scores one package from a JSON file | [tutorial](tutorial/cli.md) | [API](api/cli.md) | [design](design/cli.md) |
| `query`: query language, query tree, flat parameters, labels, sort keys | [tutorial](tutorial/query.md) | [API](api/query.md) | [design](design/query.md) |
| `query_sql`: search requests compiled to SQLite statements | [tutorial](tutorial/query_sql.md) | [API](api/query_sql.md) | [design](design/query_sql.md) |
| `static_search`: the static site's search engine | [tutorial](tutorial/static_search.md) | [API](api/static_search.md) | [design](design/static_search.md) |
| Guide: build the database, run the application, query its HTTP API | [getting started](getting_started.md) | | |
| Guide: the data pipeline from the registry to the browser | | | [architecture](architecture.md) |
| Guide: documentation rules of this repository | | | [conventions](conventions.md) |

## Exported items

- `score`: `compute_score`, `activity_multiplier`, `clamp_non_negative`,
  `rank_label`, `compute_momentum_label`, `compute_score_snapshot` and the
  struct `ScoreSnapshot`
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
  `score-snapshot --input <path>`

## Where to read next

The [score tutorial](tutorial/score.md) computes, ranks and explains scores,
the [score API](api/score.md) lists every function and threshold, and the
[score design](design/score.md) derives the formula and its invariants.

- New to the project: follow [getting started](getting_started.md) to build
  the database and open the web application, then read the
  [score tutorial](tutorial/score.md) to understand what the numbers mean.
- Using the score in a library: keep the [score API](api/score.md) at hand,
  and use the [cli tutorial](tutorial/cli.md) when the caller is not
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
moon check src/score --target all
moon check src/query src/query_sql src/static_search --target all
moon check src/cli --target js
moon test src/score --target all
moon test src/query src/query_sql src/static_search --target all
```

`CONTRIBUTING.md` adds the Python, TypeScript and static-site checks.

The rankings come from a local copy of the registry index plus optional
download counts from mooncakes.io. They are not an authoritative ranking of
the MoonBit ecosystem, and they change whenever the database is rebuilt from
a newer snapshot.
