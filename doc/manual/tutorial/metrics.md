# metrics tutorial

This tutorial shows you how to measure a small registry with the `metrics`
package: write a few release records, compute the report, and read the
dependents, signals, scores and dependency edges it contains. It then adds
the details that real registries have: yanked releases, dropped
dependencies, a download history and JSON written by another program. You
need the MoonBit toolchain; the [score tutorial](score.md) explains the
scores and labels that the report contains. The
[metrics design](../design/metrics.md) explains why the rules are what they
are.

| I want to | Use |
| --- | --- |
| measure a registry | `@metrics.compute(input)` |
| find one package in the report | `report.packages`, ordered by name |
| list the dependents of a package | `report.edges` with `target` equal to its name |
| compare with 30 days ago | `package.signals_30d_ago` and `package.snapshot` |
| use download growth | `input.download_history` with a snapshot near 30 days ago |
| read input written by another tool | `@json.from_json(@json.parse(text))` |

## Quick start

Add the module to your project:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

Import the packages in the `moon.pkg` of the package that uses them:

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/metrics",
  "Luna-Flow/mooncake-impact-factor/score",
  "moonbitlang/core/json",
}
```

Measure a registry of two packages, where `bob/web` depends on
`alice/json`:

```moonbit
test "quick start" {
  let input : @metrics.Input = {
    now: "2026-10-01T00:00:00Z",
    releases: [
      {
        name: "alice/json",
        version: "0.1.0",
        created_at: Some("2026-05-02T08:00:00Z"),
        deps: [],
        yanked: false,
      },
      {
        name: "bob/web",
        version: "0.3.0",
        created_at: Some("2026-08-20T09:30:00Z"),
        deps: ["alice/json"],
        yanked: false,
      },
    ],
    downloads: { "alice/json": 300, "bob/web": 12 },
    download_history: [],
  }
  let report = @metrics.compute(input)
  let lines = report.packages.map(p => {
    let s = p.snapshot
    "\{p.name}: dependents \{p.dependents}, score \{s.score}, rank \{s.rank_label}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|alice/json: dependents 1, score 176.29463040260106, rank S
      #|bob/web: dependents 0, score 62.75565885835565, rank C
    ),
  )
}
```

The report lists the packages in name order. `alice/json` has one
dependent and ranks first; `bob/web` has none.

`compute` raises an error only when `now` is not a valid timestamp, so the
test calls it without a handler; in a function, mark the caller with
`raise` or handle the error, as shown [below](#handle-an-invalid-now).

## Everyday tasks

The examples below write release records with a small helper and look
packages up by name. Copy both next to your tests:

```moonbit
fn release_of(
  name : String,
  version : String,
  at : String,
  deps? : Array[String] = [],
  yanked? : Bool = false,
) -> @metrics.Release {
  { name, version, created_at: Some(at), deps, yanked }
}

fn package_named(
  report : @metrics.Report,
  name : String,
) -> @metrics.PackageReport {
  report.packages.filter(p => p.name == name)[0]
}
```

### Read a package report

A `PackageReport` carries the counts, the signals that entered the score and
the score snapshot:

```moonbit
test "read a package report" {
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release_of("alice/json", "0.1.0", "2025-11-02T08:00:00Z"),
      release_of("alice/json", "0.2.0", "2026-09-10T08:00:00Z"),
      release_of("alice/http", "1.0.0", "2026-06-01T12:00:00Z", deps=["alice/json"]),
      release_of("bob/web", "0.3.0", "2026-09-25T09:30:00Z", deps=["alice/json"]),
      release_of("carol/cli", "1.0.0", "2025-03-01T00:00:00Z", deps=["alice/json"]),
    ],
    downloads: { "alice/json": 1200 },
    download_history: [],
  })
  let json = package_named(report, "alice/json")
  debug_inspect(
    json.versions,
    content=(
      #|["0.2.0", "0.1.0"]
    ),
  )
  inspect(json.days_since_release, content="20")
  inspect(json.external_dependents, content="2")
  inspect(json.self_dependents, content="1")
  inspect(json.dependent_owners, content="2")
  inspect(json.recent_dependents, content="2")
  debug_inspect(
    json.signals,
    content=(
      #|{
      #|  external_dependents: 2,
      #|  self_dependents: 1,
      #|  recent_external_dependents: 1,
      #|  recent_self_dependents: 1,
      #|  downloads: 1200,
      #|  days_since_release: 20,
      #|}
    ),
  )
  inspect(json.snapshot.rank_position, content="1")
}
```

`alice/http` belongs to the same owner, so it is a same-owner dependent and
counts a quarter in the score. `bob/web` and `alice/http` first declared the
dependency within the last 180 days, so both are recent; `carol/cli` did so
in 2025. `dependent_owners` counts the other owners only.

### List the dependents of a package

`report.edges` holds every current dependency once. Filter it by target to
list the dependents of a package, with the date each dependency first
appeared:

```moonbit
test "list dependents" {
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release_of("alice/json", "0.2.0", "2026-09-10T08:00:00Z"),
      release_of("alice/http", "1.0.0", "2026-06-01T12:00:00Z", deps=["alice/json"]),
      release_of("bob/web", "0.3.0", "2026-09-25T09:30:00Z", deps=["alice/json"]),
    ],
    downloads: {},
    download_history: [],
  })
  let lines = report.edges
    .filter(e => e.target == "alice/json")
    .map(e => {
      let owner = if e.same_owner { "same owner" } else { "external" }
      let since = e.first_seen_at.unwrap_or("an unknown date")
      "\{e.source} (\{owner}) since \{since}"
    })
  inspect(
    lines.join("\n"),
    content=(
      #|alice/http (same owner) since 2026-06-01T12:00:00.000Z
      #|bob/web (external) since 2026-09-25T09:30:00.000Z
    ),
  )
}
```

Dates in edges are normalised to UTC with milliseconds by
`@metrics.format_timestamp`.

### Follow dependency changes

Only the latest release of each dependent counts, and yanked releases are
skipped. A package that dropped a dependency is no longer a dependent:

```moonbit
test "dependency changes" {
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release_of("a/lib", "1.0.0", "2025-01-01T00:00:00Z"),
      // b/app depended on a/lib and dropped it in 2.0.0.
      release_of("b/app", "1.0.0", "2025-02-01T00:00:00Z", deps=["a/lib"]),
      release_of("b/app", "2.0.0", "2025-03-01T00:00:00Z"),
      // c/app's newest release is yanked; 1.0.0 still counts.
      release_of("c/app", "1.0.0", "2025-04-01T00:00:00Z", deps=["a/lib"]),
      release_of("c/app", "1.1.0", "2025-05-01T00:00:00Z", yanked=true),
    ],
    downloads: {},
    download_history: [],
  })
  let lib = package_named(report, "a/lib")
  inspect(lib.external_dependents, content="1")
  debug_inspect(
    report.edges.map(e => e.source),
    content=(
      #|["c/app"]
    ),
  )
  debug_inspect(
    package_named(report, "c/app").latest_version,
    content=(
      #|Some("1.0.0")
    ),
  )
  debug_inspect(
    package_named(report, "c/app").versions,
    content=(
      #|["1.1.0", "1.0.0"]
    ),
  )
}
```

`versions` lists every release, yanked ones included, newest first;
`latest_version` skips the yanked release.

### Compare with 30 days ago

The report computes every signal a second time as of 30 days before `now`,
from the releases published by then. A package without a release then has no
earlier signals and is `New`:

```moonbit
test "compare with 30 days ago" {
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release_of("a/lib", "1.0.0", "2026-01-01T00:00:00Z"),
      release_of("b/app", "1.0.0", "2026-08-01T00:00:00Z", deps=["a/lib"]),
      release_of("c/app", "1.0.0", "2026-09-20T00:00:00Z", deps=["a/lib"]),
      release_of("d/app", "1.0.0", "2026-09-21T00:00:00Z", deps=["a/lib"]),
    ],
    downloads: {},
    download_history: [],
  })
  let lib = package_named(report, "a/lib")
  let past = lib.signals_30d_ago.unwrap()
  inspect(past.external_dependents, content="1")
  inspect(lib.signals.external_dependents, content="3")
  inspect(lib.snapshot.score_30d_ago, content="43.58592235203392")
  inspect(lib.snapshot.score, content="85.23517079062273")
  inspect(lib.snapshot.momentum_label, content="Rising")
  inspect(package_named(report, "c/app").snapshot.momentum_label, content="New")
  debug_inspect(
    report.momentum_counts,
    content=(
      #|{ "Rising": 1, "Stable": 1, "New": 2 }
    ),
  )
}
```

`a/lib` went from one dependent to three in 30 days and is `Rising`. `c/app`
and `d/app` did not exist on 1 September and are `New`.

### Use a download history

Download counts only grow, so the report needs an earlier count to see
download growth. Pass the snapshots you kept in `download_history`; the one
nearest to 30 days ago, at most 7 days away, is used. Without one, the
current count stands in for the earlier count and downloads add no growth:

```moonbit
test "download history" {
  let releases = [release_of("a/lib", "1.0.0", "2026-01-01T00:00:00Z")]
  let without = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases,
    downloads: { "a/lib": 5000 },
    download_history: [],
  })
  let with_history = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases,
    downloads: { "a/lib": 5000 },
    download_history: [
      { taken_at: "2026-08-10T00:00:00Z", counts: { "a/lib": 100 } },
      { taken_at: "2026-09-03T00:00:00Z", counts: { "a/lib": 400 } },
    ],
  })
  inspect(without.download_history_used, content="false")
  debug_inspect(without.packages[0].downloads_30d_ago, content="None")
  inspect(without.packages[0].snapshot.momentum_label, content="Stable")
  inspect(with_history.download_history_used, content="true")
  debug_inspect(with_history.packages[0].downloads_30d_ago, content="Some(400)")
  inspect(with_history.packages[0].snapshot.momentum_label, content="Rising")
}
```

The snapshot of 10 August is 22 days away from 1 September and is ignored;
the one of 3 September is used.

### Read input written by another tool

The [`build-index` command](cli.md) reads the input as JSON. The same text
decodes in MoonBit with `@json.parse` and `@json.from_json`. A `None` field
is an absent key; JSON `null` is rejected:

```moonbit
test "input from JSON" {
  let text =
    #|{
    #|  "now": "2026-10-01T00:00:00Z",
    #|  "releases": [
    #|    {"name": "a/lib", "version": "1.0.0", "deps": [], "yanked": false},
    #|    {"name": "b/app", "version": "0.1.0", "created_at": "2026-09-30T12:00:00Z",
    #|     "deps": ["a/lib"], "yanked": false}
    #|  ],
    #|  "downloads": {"a/lib": 20},
    #|  "download_history": []
    #|}
  let input : @metrics.Input = @json.from_json(@json.parse(text))
  let report = @metrics.compute(input)
  let lib = report.packages[0]
  debug_inspect(lib.latest_created_at, content="None")
  inspect(lib.days_since_release, content="3650")
  debug_inspect(
    report.edges[0].first_seen_at,
    content=(
      #|Some("2026-09-30T12:00:00.000Z")
    ),
  )
}
```

`a/lib` has no `created_at`, so its release is undated: its age is
`@score.UNKNOWN_RELEASE_AGE_DAYS`, which gives the lowest multiplier.

### Handle an invalid `now`

`compute` raises `InvalidNow` when `now` does not parse. Release dates that
do not parse are not errors; they make the release undated.

```moonbit
fn measure(input : @metrics.Input) -> String {
  try @metrics.compute(input) catch {
    InvalidNow(text) => "cannot measure at \{text}"
  } noraise {
    report => "population \{report.population}"
  }
}

test "invalid now" {
  let input : @metrics.Input = {
    now: "2026-10-01",
    releases: [release_of("a/lib", "1.0.0", "last week")],
    downloads: {},
    download_history: [],
  }
  inspect(measure(input), content="cannot measure at 2026-10-01")
  inspect(measure({ ..input, now: "2026-10-01T00:00:00Z" }), content="population 1")
}
```

A date without a time and a zone is not RFC 3339, so `"2026-10-01"` is
rejected.

## Going further

**Measure the whole registry at once.** Ranks are shares of the population
that `compute` sees, so measuring a subset gives different labels. The
[`build-index` command](cli.md) passes every release of the local registry
in one input.

**Keep download snapshots.** The registry records releases with dates, so
the past dependents can be recomputed at any time, but download counts are
only known when someone fetches them. Store a snapshot of the counts every
day for at least 37 days, so that one always lies within 7 days of the
30-days-ago point. The index builder keeps 45 days.

**Store the report.** `Report` converts to JSON with `Json(report)`; the
[cli API](../api/cli.md) documents the JSON form that the index builder
stores.

## Common pitfalls

- **`null` for unknown dates.** Write no `created_at` key at all; `null`
  fails to decode.
- **Dates without a zone.** `2026-09-30T15:52:04` has no zone and does not
  parse. As `now` it raises `InvalidNow`; as a release date it makes the
  release undated, which ranks it below every dated release of its package.
- **Releases in the future.** Releases dated after `now` are ignored, but
  they still count in `version_count` and `versions`.
- **Names with different case.** `Alice/json` and `alice/json` are different
  packages with different owners.
- **Earlier counts above the current count.** An earlier download count is
  capped at the current one, so a count that went down adds no download
  change rather than a loss.

## Next steps

- [metrics API](../api/metrics.md) for every type, field and rule.
- [metrics design](../design/metrics.md) for the reasons behind the counting
  rules.
- [score tutorial](score.md) to work with the scores and labels directly.
- [cli tutorial](cli.md) to run the computation on a JSON file.
