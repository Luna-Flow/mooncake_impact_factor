# mooncake_impact_factor

`mooncake_impact_factor` ranks the packages of the MoonBit registry by how
much the ecosystem relies on them. It scores every package from its
dependents, recent dependents, downloads and release date, labels the score
with a rank and a momentum class, and lets you search and filter the result
in a web application that runs locally against SQLite or as a static site.

This manual describes version `0.1.2` of the module
`Luna-Flow/mooncake-impact-factor`.

## Packages

The MoonBit module has three packages. Each has an API reference, a tutorial
and a design note.

| Package | Purpose | Pages |
| --- | --- | --- |
| `score` | The impact score, rank labels, momentum labels and score snapshots. | [API](api/score.md) · [tutorial](tutorial/score.md) · [design](design/score.md) |
| `cli` | A JavaScript command that computes a score snapshot from a JSON file, used by the Python index builder. | [API](api/cli.md) · [tutorial](tutorial/cli.md) · [design](design/cli.md) |
| `static_search` | The version tag and text normalisation of the browser search in static mode. | [API](api/static_search.md) · [tutorial](tutorial/static_search.md) · [design](design/static_search.md) |

The rest of the repository is not MoonBit: the Python index builder and
static exporter in `scripts/`, and the Next.js application in `app/`,
`frontend/src/` and `lib/`. The [architecture guide](architecture.md) shows
how they fit together.

## Guides

- [Getting started](getting_started.md): build the database, run the web
  application and query its HTTP API.
- [Architecture](architecture.md): the data pipeline from the registry to the
  browser, and which file owns which rule.
- [Conventions](conventions.md): the documentation rules specific to this
  repository.

## Reading paths

**I want to see the rankings.** Follow [getting started](getting_started.md)
to build the database and open the web application, then read the
[score tutorial](tutorial/score.md) to understand what the numbers mean.

**I want to use the score in MoonBit.** Start with the
[score tutorial](tutorial/score.md) and keep the [score API](api/score.md)
at hand. Use the [cli tutorial](tutorial/cli.md) when the caller is not
MoonBit.

**I want to change the model or the search.** Read the
[score design](design/score.md) for the derivation of the formula and its
invariants, the [static_search design](design/static_search.md) for the
browser index and its ranking, and the [architecture guide](architecture.md)
for how the signals are counted. The repository's `CONTRIBUTING.md` lists the
checks to run.

## Install

```bash
moon add Luna-Flow/mooncake-impact-factor@0.1.2
```

Then import the package you need in `moon.pkg`, for example
`"Luna-Flow/mooncake-impact-factor/score"`. `score` builds for every target;
`cli` and `static_search` build only for the JavaScript target.

## Toolchain

- MoonBit with `moonc` 0.10 or later. The module uses the `moon.mod` and
  `moon.pkg` manifest formats.
- Node.js 20.16, 22.3 or later to run `cli` and the web application.
- Python 3 for the index builder and the static exporter.

## Scope

The rankings come from a local copy of the registry index plus optional
download counts from mooncakes.io. They are not an authoritative ranking of
the MoonBit ecosystem, and they change whenever the database is rebuilt from
a newer snapshot.
