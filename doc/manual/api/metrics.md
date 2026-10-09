# metrics API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/metrics` measures a registry.
It takes every release record of the registry, the current download counts
and a short download history, and computes for each package its latest
release, its current dependents, the [`@score.Signals`](score.md#signals)
now and 30 days ago, and the score snapshot of the
[`score` package](score.md). It also returns the current dependency edges and
counts per label. Every decision that affects a score is taken here or in
`score`; the [`build-index` command](cli.md) runs this computation for the
index builder.

The computation is pure: it reads no clock and no files, and the same input
gives the same report on every backend. The reasons for the counting rules
are in the [metrics design](../design/metrics.md).

Source: [`src/metrics/metrics.mbt`](../../../src/metrics/metrics.mbt),
[`src/metrics/time.mbt`](../../../src/metrics/time.mbt) and
[`src/metrics/semver.mbt`](../../../src/metrics/semver.mbt).

## Importing

Add the package to the `moon.pkg` of the package that uses it. The examples
on this page call it as `@metrics` and also use `@score` and
`moonbitlang/core/json`.

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/metrics",
  "Luna-Flow/mooncake-impact-factor/score",
  "moonbitlang/core/json",
}
```

The derived traits are used as traits: `Json(value)`, `@json.from_json(json)`,
`debug_inspect`, `Repr(value)` and, for the input types and `Edge`, `==`.

## Overview

| Group | Items |
| --- | --- |
| [Constants](#constants) | `RECENT_WINDOW_DAYS`, `MOMENTUM_WINDOW_DAYS`, `DOWNLOAD_HISTORY_TOLERANCE_DAYS`, `MILLIS_PER_DAY` |
| [Input](#input) | `Release`, `DownloadSnapshot`, `Input` |
| [Computation](#computation) | `compute`, `MetricsError` |
| [Report](#report) | `Report`, `PackageReport`, `Edge` |
| [Timestamps](#timestamps) | `parse_timestamp`, `format_timestamp`, `days_between` |
| [Names and versions](#names-and-versions) | `owner_of`, `compare_versions`, `compare_text` |

## JSON form

Every struct of this package converts to and from JSON with the field names
as keys. Two rules matter when the JSON is written by another program, as it
is for the [`build-index` command](cli.md):

- An `Option` field that is `None` is an absent key, and `Some(x)` is the
  value of `x`. JSON `null` is not `None`: `"created_at": null` fails to
  decode. Write the key only when there is a value.
- Every other field is required. A missing key, a value of the wrong type or
  an integer outside the `Int` range raises `@json.JsonDecodeError`; a
  fractional number in an `Int` field is truncated. Unknown keys are
  ignored.

`Map[String, Int]` fields are JSON objects from names to numbers.

## Constants

### `RECENT_WINDOW_DAYS`

`RECENT_WINDOW_DAYS` is the length of the window in which a new dependent
counts as recent.

```mbti
pub const RECENT_WINDOW_DAYS : Int = 180
```

A dependent is recent at a point in time $\tau$ when its dependency first
appeared after $\tau - 180$ days and at or before $\tau$.

```moonbit
test "RECENT_WINDOW_DAYS" {
  inspect(@metrics.RECENT_WINDOW_DAYS, content="180")
}
```

### `MOMENTUM_WINDOW_DAYS`

`MOMENTUM_WINDOW_DAYS` is the distance between the two points in time that
the momentum compares.

```mbti
pub const MOMENTUM_WINDOW_DAYS : Int = 30
```

The earlier point is `now` minus exactly 30 days of 86 400 000 ms.

```moonbit
test "MOMENTUM_WINDOW_DAYS" {
  let now = @metrics.parse_timestamp("2026-10-01T00:00:00Z").unwrap()
  let window = @metrics.MOMENTUM_WINDOW_DAYS.to_int64() * @metrics.MILLIS_PER_DAY
  inspect(@metrics.format_timestamp(now - window), content="2026-09-01T00:00:00.000Z")
}
```

### `DOWNLOAD_HISTORY_TOLERANCE_DAYS`

`DOWNLOAD_HISTORY_TOLERANCE_DAYS` is how far a download snapshot may be from
the 30-days-ago point and still stand for it.

```mbti
pub const DOWNLOAD_HISTORY_TOLERANCE_DAYS : Int = 7
```

A snapshot taken at most 7 days before or after that point qualifies,
the bounds included.

```moonbit
test "DOWNLOAD_HISTORY_TOLERANCE_DAYS" {
  inspect(@metrics.DOWNLOAD_HISTORY_TOLERANCE_DAYS, content="7")
}
```

### `MILLIS_PER_DAY`

`MILLIS_PER_DAY` is the number of milliseconds in a day, the unit of the
timestamps of this package.

```mbti
pub const MILLIS_PER_DAY : Int64 = 86_400_000
```

The package counts every day as 86 400 seconds, like Unix time; leap seconds
do not exist for it.

```moonbit
test "MILLIS_PER_DAY" {
  inspect(@metrics.MILLIS_PER_DAY, content="86400000")
}
```

## Input

### `Release`

`Release` is one published version of a package, as listed in the registry
index.

```mbti
pub(all) struct Release {
  name : String
  version : String
  created_at : String?
  deps : Array[String]
  yanked : Bool
} derive(Eq, ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `name` | Full package name, `owner/package`. All releases with the same `name` form one package. |
| `version` | Version string, ordered by [`compare_versions`](#compare_versions). |
| `created_at` | Publication time in RFC 3339, or `None` when unknown. |
| `deps` | Names of the packages this release declares as dependencies; version requirements are not needed. |
| `yanked` | Whether the release was yanked. |

A `created_at` that is `None` or that [`parse_timestamp`](#parse_timestamp)
rejects makes the release undated. An undated release counts as older than
every dated release of the same package, and as published before every point
in time. A release dated after `now` does not exist yet for the computation.
Dependencies on names that have no release in the input, on the package
itself, and repeated names are ignored.

```moonbit
test "Release" {
  let release : @metrics.Release = {
    name: "alice/json",
    version: "0.2.0",
    created_at: Some("2026-09-10T08:00:00Z"),
    deps: ["moonbitlang/x"],
    yanked: false,
  }
  inspect(
    Json(release).stringify(),
    content=(
      #|{"name":"alice/json","version":"0.2.0","created_at":"2026-09-10T08:00:00Z","deps":["moonbitlang/x"],"yanked":false}
    ),
  )
  let undated : @metrics.Release = { ..release, created_at: None }
  inspect(
    Json(undated).stringify(),
    content=(
      #|{"name":"alice/json","version":"0.2.0","deps":["moonbitlang/x"],"yanked":false}
    ),
  )
}
```

### `DownloadSnapshot`

`DownloadSnapshot` holds the download counts of every package at one moment.

```mbti
pub(all) struct DownloadSnapshot {
  taken_at : String
  counts : Map[String, Int]
} derive(Eq, ToJson, @debug.Debug, @json.FromJson)
```

`taken_at` is an RFC 3339 timestamp; a snapshot whose `taken_at` does not
parse is skipped. `counts` maps package names to cumulative download counts.
A package missing from `counts` has no known count in that snapshot.

```moonbit
test "DownloadSnapshot" {
  let snapshot : @metrics.DownloadSnapshot = {
    taken_at: "2026-09-02T00:00:00Z",
    counts: { "alice/json": 900, "alice/http": 280 },
  }
  inspect(
    Json(snapshot).stringify(),
    content=(
      #|{"taken_at":"2026-09-02T00:00:00Z","counts":{"alice/json":900,"alice/http":280}}
    ),
  )
}
```

### `Input`

`Input` is everything the computation reads.

```mbti
pub(all) struct Input {
  now : String
  releases : Array[Release]
  downloads : Map[String, Int]
  download_history : Array[DownloadSnapshot]
} derive(Eq, ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `now` | The point in time to measure at, RFC 3339. It must parse, or `compute` raises `InvalidNow`. |
| `releases` | Every release of the registry, in any order. The packages are the distinct names in it. |
| `downloads` | Current download counts. A missing package counts `0`, a negative count `0`, and names without releases are ignored. |
| `download_history` | Earlier download snapshots, in any order; may be empty. |

```moonbit
test "Input" {
  let input : @metrics.Input = {
    now: "2026-10-01T00:00:00Z",
    releases: [],
    downloads: {},
    download_history: [],
  }
  inspect(
    Json(input).stringify(),
    content=(
      #|{"now":"2026-10-01T00:00:00Z","releases":[],"downloads":{},"download_history":[]}
    ),
  )
  let back : @metrics.Input = @json.from_json(Json(input))
  assert_eq(back, input)
}
```

## Computation

### `compute`

`compute` measures every package of the input and returns the report.

```mbti
pub fn compute(Input) -> Report raise MetricsError
```

With $\tau$ = `now` and $\tau_{30}$ = `now` minus `MOMENTUM_WINDOW_DAYS`, the
computation proceeds as follows.

1. **Packages.** Every distinct `name` among the releases is a package. The
   report lists the packages in [`compare_text`](#compare_text) order of
   their names.
2. **Latest release.** The latest release at a point in time is the newest
   release published by then, ordered by date and then by version
   precedence. Yanked releases are skipped; when every release published by
   then is yanked, the newest yanked one is the latest release shown in the
   report, but its dependencies are not edges.
3. **Current edges.** For each package, the dependencies of its latest
   non-yanked release published by $\tau$ are its current dependencies. The
   date a dependency was first seen is that of the earliest non-yanked
   release published by $\tau$ that declares it; it is unknown when any such
   release is undated.
4. **Dependents.** A package's dependents are the sources of the current
   edges into it. A dependent is same-owner when [`owner_of`](#owner_of)
   gives the same owner for both names, and external otherwise. It is recent
   when its first-seen date lies in $(\tau - 180\text{ days}, \tau]$; an
   unknown date is never recent.
5. **Downloads 30 days ago.** The snapshot of `download_history` nearest to
   $\tau_{30}$, within `DOWNLOAD_HISTORY_TOLERANCE_DAYS` either way, stands
   for that point; among equally near snapshots the first in the array wins.
   A package's count 30 days ago is its count in that snapshot, clamped to
   $[0, \text{current count}]$, or unknown when the package is not in it or
   no snapshot qualifies.
6. **Signals 30 days ago.** Steps 2 to 4 are repeated at $\tau_{30}$ with
   only the releases published by then, so dependents added later and
   releases published later do not count. The downloads are the count 30
   days ago, or the current count when it is unknown, which adds no download
   growth. A package with no release published by $\tau_{30}$ has no earlier
   signals and is `New`.
7. **Release age.** `days_since_release` is the number of whole days from the
   latest release to the point in time, at least `0`, or
   `@score.UNKNOWN_RELEASE_AGE_DAYS` when the latest release is undated or
   there is none.
8. **Scores.** [`@score.score_population`](score.md#score_population) scores
   all packages together, so ranks are relative to the whole input.

`compute` raises `InvalidNow` when `now` does not parse. Malformed release
dates and snapshot times do not raise; they are treated as described above.
An input without releases gives an empty report.

```moonbit
test "compute" {
  let input : @metrics.Input = {
    now: "2026-10-01T00:00:00Z",
    releases: [
      {
        name: "alice/json",
        version: "0.2.0",
        created_at: Some("2026-09-10T08:00:00Z"),
        deps: [],
        yanked: false,
      },
      {
        name: "alice/http",
        version: "1.0.0",
        created_at: Some("2026-06-01T12:00:00Z"),
        deps: ["alice/json"],
        yanked: false,
      },
      {
        name: "bob/web",
        version: "0.3.0",
        created_at: Some("2026-09-25T09:30:00Z"),
        deps: ["alice/http", "alice/json", "zed/missing"],
        yanked: false,
      },
    ],
    downloads: { "alice/json": 1200, "alice/http": 300 },
    download_history: [],
  }
  let report = @metrics.compute(input)
  let lines = report.packages.map(p => {
    let s = p.snapshot
    "\{p.name}: \{p.external_dependents} external, \{p.self_dependents} own, " +
    "\{p.recent_dependents} recent, \{s.rank_label} \{s.momentum_label}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|alice/http: 1 external, 0 own, 1 recent, B Rising
      #|alice/json: 1 external, 1 own, 2 recent, S New
      #|bob/web: 0 external, 0 own, 0 recent, D New
    ),
  )
  inspect(report.edges.length(), content="3")
}
```

`zed/missing` has no release in the input, so the dependency on it is not
an edge. `alice/http` depends on `alice/json` with the same owner, so
`alice/json` has one external and one same-owner dependent. Both dependencies
appeared within 180 days, so they are recent. `alice/json` and `bob/web` had
no release on 1 September, 30 days before `now`, and are `New`.

### `MetricsError`

`MetricsError` is raised when the input makes the computation meaningless.

```mbti
pub suberror MetricsError {
  InvalidNow(String)
} derive(@debug.Debug)
pub impl Show for MetricsError
```

`InvalidNow(text)` carries the `now` text that `parse_timestamp` rejected.
The type is read-only outside the package: you can match on `InvalidNow`
but not construct it.
`Show` writes `invalid timestamp for now: <text>`, which is the message the
[`build-index` command](cli.md) prints.

```moonbit
test "MetricsError" {
  let input : @metrics.Input = {
    now: "yesterday",
    releases: [],
    downloads: {},
    download_history: [],
  }
  let message = try @metrics.compute(input) catch {
    InvalidNow(text) => "rejected \{text}"
  } noraise {
    _ => "computed"
  }
  inspect(message, content="rejected yesterday")
  try @metrics.compute(input) catch {
    error => inspect(error, content="invalid timestamp for now: yesterday")
  } noraise {
    _ => fail("expected InvalidNow")
  }
}
```

## Report

### `Report`

`Report` is the result of `compute`.

```mbti
pub(all) struct Report {
  computed_at : String
  population : Int
  download_history_used : Bool
  rank_counts : Map[String, Int]
  momentum_counts : Map[String, Int]
  top_score : Double
  packages : Array[PackageReport]
  edges : Array[Edge]
} derive(ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `computed_at` | `now`, normalised by `format_timestamp` to UTC with milliseconds. |
| `population` | Number of packages. |
| `download_history_used` | Whether a download snapshot stood for the 30-days-ago point. |
| `rank_counts` | Number of packages per rank label; labels that no package has are absent. |
| `momentum_counts` | Number of packages per momentum label, likewise. |
| `top_score` | The best score, the scale of relative score bars; `0` for an empty report. |
| `packages` | One `PackageReport` per package, in `compare_text` order of the names. |
| `edges` | The current dependency edges, by source in package order, then in the order of the source's `deps`. |

The keys of the two count maps appear in the order in which the labels first
occur in `packages`. The struct does not implement `Eq`.

```moonbit
test "Report" {
  let release : @metrics.Release = {
    name: "a/core",
    version: "1.0.0",
    created_at: Some("2026-01-15T00:00:00Z"),
    deps: [],
    yanked: false,
  }
  let report = @metrics.compute({
    now: "2026-10-01T09:00:00+09:00",
    releases: [
      release,
      { ..release, name: "b/app", deps: ["a/core"] },
      { ..release, name: "c/app", deps: ["a/core"] },
    ],
    downloads: {},
    download_history: [],
  })
  inspect(report.computed_at, content="2026-10-01T00:00:00.000Z")
  inspect(report.population, content="3")
  debug_inspect(
    report.rank_counts,
    content=(
      #|{ "S": 1, "D": 2 }
    ),
  )
  debug_inspect(
    report.momentum_counts,
    content=(
      #|{ "Stable": 3 }
    ),
  )
  inspect(report.top_score, content="39.90789484858766")
}
```

### `PackageReport`

`PackageReport` holds the measured signals and the score of one package.

```mbti
pub(all) struct PackageReport {
  name : String
  owner : String
  package_name : String
  latest_version : String?
  latest_created_at : String?
  version_count : Int
  versions : Array[String]
  dependents : Int
  external_dependents : Int
  self_dependents : Int
  recent_dependents : Int
  dependent_owners : Int
  downloads : Int
  downloads_30d_ago : Int?
  days_since_release : Int
  signals : @score.Signals
  signals_30d_ago : @score.Signals?
  snapshot : @score.ScoreSnapshot
} derive(ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `name` | Full name, `owner/package`. |
| `owner` | `owner_of(name)`. |
| `package_name` | The part after the first `/`, or the whole name when it has none. |
| `latest_version` | Version of the latest release at `now`; `None` when every release is dated after `now`. |
| `latest_created_at` | `created_at` of that release as given in the input, not normalised; `None` when undated. |
| `version_count` | Number of release records of the package, yanked and future ones included. |
| `versions` | Every version, newest first: by release date, then by version precedence; undated releases last. |
| `dependents` | `external_dependents + self_dependents`. |
| `external_dependents` | Current dependents of other owners. |
| `self_dependents` | Current dependents of the same owner. |
| `recent_dependents` | Recent dependents, external and same-owner together. |
| `dependent_owners` | Number of distinct owners among the external dependents. |
| `downloads` | Current download count, at least `0`. |
| `downloads_30d_ago` | Count in the download snapshot used for 30 days ago; `None` when unknown. |
| `days_since_release` | Whole days since the latest release, or `@score.UNKNOWN_RELEASE_AGE_DAYS`. |
| `signals` | The current [`@score.Signals`](score.md#signals). |
| `signals_30d_ago` | The signals 30 days ago; `None` when the package had no release then. |
| `snapshot` | The [`@score.ScoreSnapshot`](score.md#scoresnapshot) within the whole input. |

The count fields repeat parts of `signals` so that a reader of the JSON does
not need to add them up. The struct does not implement `Eq`.

```moonbit
test "PackageReport" {
  let release : @metrics.Release = {
    name: "alice/json",
    version: "0.1.0",
    created_at: Some("2025-11-02T08:00:00Z"),
    deps: [],
    yanked: false,
  }
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release,
      { ..release, version: "0.2.0", created_at: Some("2026-09-10T08:00:00Z") },
      { ..release, version: "0.3.0-rc.1", created_at: None },
    ],
    downloads: { "alice/json": 1200 },
    download_history: [
      { taken_at: "2026-09-04T00:00:00Z", counts: { "alice/json": 900 } },
    ],
  })
  let p = report.packages[0]
  debug_inspect(
    (p.owner, p.package_name, p.latest_version, p.versions),
    content=(
      #|("alice", "json", Some("0.2.0"), ["0.2.0", "0.1.0", "0.3.0-rc.1"])
    ),
  )
  debug_inspect(
    (p.downloads, p.downloads_30d_ago, p.days_since_release),
    content="(1200, Some(900), 20)",
  )
  debug_inspect(
    p.signals_30d_ago.map(s => (s.downloads, s.days_since_release)),
    content="Some((900, 302))",
  )
}
```

### `Edge`

`Edge` is a current dependency: the latest non-yanked release of `source`
declares `target`.

```mbti
pub(all) struct Edge {
  source : String
  target : String
  first_seen_at : String?
  same_owner : Bool
} derive(Eq, ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `source` | The dependent package. |
| `target` | The package it depends on. |
| `first_seen_at` | Publication time of the earliest non-yanked release of `source` that declares `target`, formatted by `format_timestamp`; `None` when that time is unknown. |
| `same_owner` | Whether `source` and `target` have the same owner. |

Self-dependencies and dependencies outside the input are not edges, and each
pair appears at most once.

```moonbit
test "Edge" {
  let release : @metrics.Release = {
    name: "b/app",
    version: "1.0.0",
    created_at: Some("2026-03-01T10:00:00+02:00"),
    deps: ["a/core", "b/app", "a/core"],
    yanked: false,
  }
  let report = @metrics.compute({
    now: "2026-10-01T00:00:00Z",
    releases: [
      release,
      { ..release, version: "1.1.0", created_at: Some("2026-08-01T00:00:00Z") },
      { ..release, name: "a/core", deps: [] },
    ],
    downloads: {},
    download_history: [],
  })
  debug_inspect(
    report.edges,
    content=(
      #|[
      #|  {
      #|    source: "b/app",
      #|    target: "a/core",
      #|    first_seen_at: Some("2026-03-01T08:00:00.000Z"),
      #|    same_owner: false,
      #|  },
      #|]
    ),
  )
}
```

## Timestamps

### `parse_timestamp`

`parse_timestamp` parses an RFC 3339 timestamp and returns milliseconds
since the Unix epoch.

```mbti
pub fn parse_timestamp(String) -> Int64?
```

The accepted form is `YYYY-MM-DDTHH:MM:SS`, an optional fraction `.d…`
with at least one digit, and a zone `Z` or `±HH:MM`. The separator may be
`T`, `t` or a space, and the zone letter `Z` or `z`. Fractions are truncated
to milliseconds. The function returns `None` for anything else: a missing
zone, trailing text, a day that does not exist in that month (`2026-02-29`),
an hour above 23, a minute above 59 or a second above 60. A leap second
`:60` is accepted and counts as the first second of the next minute. Times
before 1970 give negative values.

```moonbit
test "parse_timestamp" {
  debug_inspect(@metrics.parse_timestamp("1970-01-01T00:00:00Z"), content="Some(0)")
  debug_inspect(
    @metrics.parse_timestamp("2026-09-30T15:52:04.965858+00:00"),
    content="Some(1790783524965)",
  )
  debug_inspect(
    @metrics.parse_timestamp("2026-10-01T00:52:04.965+09:00"),
    content="Some(1790783524965)",
  )
  debug_inspect(@metrics.parse_timestamp("1969-12-31T23:59:59Z"), content="Some(-1000)")
  debug_inspect(@metrics.parse_timestamp("2026-02-29T00:00:00Z"), content="None")
  debug_inspect(@metrics.parse_timestamp("2026-09-30T15:52:04"), content="None")
}
```

### `format_timestamp`

`format_timestamp` formats milliseconds since the Unix epoch as
`YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC.

```mbti
pub fn format_timestamp(Int64) -> String
```

Negative values are times before 1970. For years 0 to 9999 the result
parses back to the same value, so `format_timestamp` normalises any
timestamp that `parse_timestamp` accepts to UTC with exactly three fraction
digits.

```moonbit
test "format_timestamp" {
  inspect(@metrics.format_timestamp(0L), content="1970-01-01T00:00:00.000Z")
  inspect(@metrics.format_timestamp(-1L), content="1969-12-31T23:59:59.999Z")
  let t = @metrics.parse_timestamp("2026-10-01T00:52:04.9658+09:00").unwrap()
  inspect(@metrics.format_timestamp(t), content="2026-09-30T15:52:04.965Z")
  assert_eq(@metrics.parse_timestamp(@metrics.format_timestamp(t)), Some(t))
}
```

### `days_between`

`days_between` returns the whole days from `earlier` to `later`, both in
epoch milliseconds, rounded towards negative infinity.

```mbti
pub fn days_between(Int64, Int64) -> Int
```

The result is negative when `later` is before `earlier`: one millisecond
backwards is `-1` day.

```moonbit
test "days_between" {
  let a = @metrics.parse_timestamp("2026-09-01T12:00:00Z").unwrap()
  let b = @metrics.parse_timestamp("2026-10-01T11:59:59Z").unwrap()
  inspect(@metrics.days_between(a, b), content="29")
  inspect(@metrics.days_between(b, a), content="-30")
  inspect(@metrics.days_between(0L, -1L), content="-1")
}
```

## Names and versions

### `owner_of`

`owner_of` returns the owner of a package name: the part before the first
`/`, or the whole name when it has no `/`.

```mbti
pub fn owner_of(String) -> String
```

Two packages have the same owner exactly when `owner_of` returns the same
string for both. The comparison is exact; case is not folded.

```moonbit
test "owner_of" {
  inspect(@metrics.owner_of("alice/json"), content="alice")
  inspect(@metrics.owner_of("alice/tree-sitter/cli"), content="alice")
  inspect(@metrics.owner_of("standalone"), content="standalone")
}
```

### `compare_versions`

`compare_versions` compares two version strings by Semantic Versioning 2.0.0
precedence and returns a negative number, `0` or a positive number.

```mbti
pub fn compare_versions(String, String) -> Int
```

The numeric core `MAJOR.MINOR.PATCH` is compared first, by value and without
overflow. A release ranks above its pre-releases. Pre-release identifiers
compare one by one: numeric ones by value and below alphanumeric ones,
alphanumeric ones in ASCII order, and a shorter list ranks lower when it is
a prefix of the other. Build metadata after `+` is ignored, so `1.0.0+a` and
`1.0.0+b` compare equal. A core component that is missing or not a number
counts as `0`, so every pair of strings is ordered, though not every string
is a valid version.

```moonbit
test "compare_versions" {
  inspect(@metrics.compare_versions("1.10.0", "1.9.0"), content="1")
  inspect(@metrics.compare_versions("1.0.0-rc.1", "1.0.0"), content="-1")
  inspect(@metrics.compare_versions("1.0.0-alpha.2", "1.0.0-alpha.10"), content="-1")
  inspect(@metrics.compare_versions("1.0.0-1", "1.0.0-alpha"), content="-1")
  inspect(@metrics.compare_versions("1.0.0+build.5", "1.0.0"), content="0")
  inspect(@metrics.compare_versions("1.2", "1.2.0"), content="0")
}
```

### `compare_text`

`compare_text` compares two strings UTF-16 code unit by code unit and returns
a negative number, `0` or a positive number.

```mbti
pub fn compare_text(String, String) -> Int
```

When one string is a prefix of the other, the shorter one comes first. The
order does not depend on the locale or on the backend; it is the order of
package names in the report.

```moonbit
test "compare_text" {
  inspect(@metrics.compare_text("alice/http", "alice/json"), content="-1")
  inspect(@metrics.compare_text("Zed/x", "alice/x"), content="-1")
  inspect(@metrics.compare_text("alice", "alice/json"), content="-1")
  inspect(@metrics.compare_text("same", "same"), content="0")
}
```
