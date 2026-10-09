# score tutorial

This tutorial shows you how to score MoonBit packages with the `score`
package: describe a package by its signals, compute and explain its score,
rank a small population, and read the momentum labels that compare a
package with itself 30 days earlier. You need the MoonBit toolchain and a
project to add the dependency to. The [score design](../design/score.md)
explains why the formula and the labels are what they are; this page only
uses them.

| I want to | Use |
| --- | --- |
| score one package | `@score.compute_score(signals)` |
| see where a score comes from | `@score.score_breakdown(signals)` |
| rank and label a population | `@score.score_population(current, past)` |
| rank scores computed elsewhere | `@score.rank_positions(scores)` and `@score.rank_label(position, population, score)` |
| label a 30-day change | `@score.compute_momentum_label(score, score_30d_ago)` |
| count signals from release records | the [`metrics` package](metrics.md) |

## Quick start

Add the module to your project:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

Import the package in the `moon.pkg` of the package that uses it. The JSON
examples below also need `moonbitlang/core/json`:

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/score",
  "moonbitlang/core/json",
}
```

Describe a package that 12 packages of other owners and 4 packages of its
own owner depend on, 3 of the external ones added in the last 180 days, with
850 downloads and a release 45 days ago, and score it:

```moonbit
test "quick start" {
  let signals : @score.Signals = {
    external_dependents: 12,
    self_dependents: 4,
    recent_external_dependents: 3,
    recent_self_dependents: 0,
    downloads: 850,
    days_since_release: 45,
  }
  inspect(@score.compute_score(signals), content="317.3965306194994")
}
```

The score is a plain `Double` that grows with every signal. On its own it
says little; it becomes useful when you compare packages, which the
following sections do.

## Everyday tasks

The examples below build signals with a small helper, so that each example
names only the signals it cares about. Copy it next to your tests:

```moonbit
fn package_signals(
  external? : Int = 0,
  self_owned? : Int = 0,
  recent_external? : Int = 0,
  recent_self? : Int = 0,
  downloads? : Int = 0,
  days? : Int = 100,
) -> @score.Signals {
  {
    external_dependents: external,
    self_dependents: self_owned,
    recent_external_dependents: recent_external,
    recent_self_dependents: recent_self,
    downloads,
    days_since_release: days,
  }
}
```

### Explain where a score comes from

`score_breakdown` returns the three weighted terms and the release
multiplier. The score is the sum of the terms times the multiplier:

```moonbit
test "explain a score" {
  let signals = package_signals(
    external=12,
    self_owned=4,
    recent_external=3,
    downloads=850,
    days=45,
  )
  let parts = @score.score_breakdown(signals)
  inspect(parts.dependents, content="100.28417852537982")
  inspect(parts.recent_dependents, content="37.42994775023705")
  inspect(parts.downloads, content="148.42106682861424")
  inspect(parts.multiplier, content="1.1092537313432838")
  let total = (parts.dependents + parts.recent_dependents + parts.downloads) *
    parts.multiplier
  assert_eq(total, @score.compute_score(signals))
}
```

The equality is exact: `compute_score` evaluates the same expression. Each
term is a weight times $\ln(1 + n)$, so doubling a count adds far less than
double the points.

### Compare external and same-owner dependents

A dependent of the same owner counts a quarter
(`SELF_DEPENDENT_WEIGHT`). Eight packages of the author's own weigh as
much as two packages of other owners:

```moonbit
test "same-owner dependents" {
  let own = @score.compute_score(package_signals(self_owned=8))
  let others = @score.compute_score(package_signals(external=2))
  assert_eq(own, others)
  inspect(own, content="44.663344721876776")
}
```

### See the effect of release age

`activity_multiplier` scales the whole score from 1.12 for a release at most
30 days old down to 0.88 for one a year old or older, in a straight line in
between:

```moonbit
test "release age" {
  let lines = [10, 30, 120, 200, 365, 800].map(days => {
    let score = @score.compute_score(package_signals(external=5, days~))
    "\{days} \{@score.activity_multiplier(days)} \{score}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|10 1.12 76.25728301034603
      #|30 1.12 76.25728301034603
      #|120 1.0555223880597016 71.86720488395083
      #|200 0.9982089552238808 67.96491321604401
      #|365 0.88 59.91643665098616
      #|800 0.88 59.91643665098616
    ),
  )
}
```

The same signals lose about a fifth of their score over the first year
without a release, and nothing after that.

### Rank a population

Rank labels are relative: `S` is the best 5 % of a population, `A` the next
10 %, `B` the next 20 %, `C` the next 30 % and `D` the rest. Score a
population with `score_population`. Its second argument holds the signals 30
days ago; pass `None` when you do not have them, which marks every package
as `New`:

```moonbit
test "rank a population" {
  let names = ["alice/json", "bob/http", "carol/csv", "dave/math", "erin/demo"]
  let current = [
    package_signals(external=40, recent_external=6, downloads=1200, days=20),
    package_signals(external=12, recent_external=1, downloads=90, days=400),
    package_signals(external=12, recent_external=1, downloads=90, days=400),
    package_signals(external=3, downloads=10, days=15),
    package_signals(),
  ]
  let past : Array[@score.Signals?] = current.map(_ => None)
  let snapshots = @score.score_population(current[:], past[:])
  let lines = names.mapi((i, name) => {
    let s = snapshots[i]
    "\{s.rank_position} \{s.rank_label} \{name} \{s.score}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|1 S alice/json 391.6139680824188
      #|2 B bob/http 189.57132356978428
      #|2 B carol/csv 189.57132356978428
      #|4 C dave/math 118.08482753101441
      #|5 D erin/demo 0
    ),
  )
}
```

`bob/http` and `carol/csv` have the same signals, so they share position 2
and the next position is 4. `erin/demo` has no signal at all and is `D`
whatever its position. With only five packages, one package is already 20 %
of the population: only the first can be `S`, and none is `A`, because the
second position already has 20 % of the population above it.

### Measure momentum over 30 days

Pass the signals as they were 30 days ago to get the change and the
momentum label. A package needs to gain at least 10 points and at least
10 % of its earlier score to be `Rising`, and to lose as much to be
`Cooling`:

```moonbit
test "momentum" {
  let current = [
    package_signals(external=10, recent_external=4, downloads=900, days=10),
    package_signals(external=3, downloads=400, days=60),
    package_signals(external=2, downloads=100, days=200),
    package_signals(external=1, downloads=20, days=5),
  ]
  let past = [
    Some(package_signals(external=6, downloads=700, days=300)),
    Some(package_signals(external=3, downloads=390, days=30)),
    Some(package_signals(external=4, recent_external=2, downloads=100, days=170)),
    None,
  ]
  let snapshots = @score.score_population(current[:], past[:])
  let lines = snapshots.map(s => {
    "\{s.momentum_label} \{s.score_30d_ago} -> \{s.score} (\{s.score_growth_30d})"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|Rising 202.08407537050462 -> 318.3621948297753 (116.2781194592707)
      #|Stable 206.06964228730197 -> 202.7255285414165 (-3.3441137458854655)
      #|Cooling 196.1434812618917 -> 143.0232975906304 (-53.120183671261316)
      #|New 0 -> 104.51737687013643 (104.51737687013643)
    ),
  )
}
```

The first package gained dependents, downloads and a fresh release. The
second changed by a few points only. The third lost two dependents and aged.
The fourth had no release 30 days ago, so its earlier score is reported as
`0` and its label is `New`.

### Label scores you computed elsewhere

`rank_positions` and `rank_label` work on any list of scores, for example
scores read back from a database:

```moonbit
test "label stored scores" {
  let scores = [310.5, 42.0, 0.0, 188.25, 42.0, 97.0, 12.5, 5.0, 230.0, 61.0]
  let positions = @score.rank_positions(scores[:])
  let labels = scores.mapi((i, score) => {
    @score.rank_label(positions[i], scores.length(), score)
  })
  debug_inspect(positions, content="[1, 6, 10, 3, 6, 4, 8, 9, 2, 5]")
  debug_inspect(
    labels,
    content=(
      #|["S", "C", "D", "B", "C", "B", "D", "D", "A", "C"]
    ),
  )
}
```

With ten packages each position is 10 % of the population: position 1 is
`S`, position 2 `A`, positions 3 and 4 `B`, positions 5 to 7 `C` (here 5 and
the tied 6) and the rest `D`. The score `0.0` is `D` in any case.

### Store snapshots as JSON

`ScoreSnapshot` converts to JSON with `Json(...)` and back with
`@json.from_json`. The `snapshot` object of the
[`build-index` report](cli.md) is this form:

```moonbit
test "snapshot as JSON" {
  let snapshot = @score.score_population(
    [package_signals(external=2, downloads=30, days=400)][:],
    [None][:],
  )[0]
  inspect(
    Json(snapshot).stringify(),
    content=(
      #|{"score":103.21958721189402,"score_30d_ago":0,"score_growth_30d":103.21958721189402,"score_growth_ratio_30d":1,"rank_label":"S","rank_position":1,"momentum_label":"New","activity_multiplier":0.88,"breakdown":{"dependents":41.747266969388164,"recent_dependents":0,"downloads":75.54771849867322,"multiplier":0.88}}
    ),
  )
  let back : @score.ScoreSnapshot = @json.from_json(Json(snapshot))
  assert_eq(Json(back), Json(snapshot))
}
```

`ScoreSnapshot` has no `Eq` implementation, so the check compares the JSON
forms.

## Going further

**Count signals the way the published scores do.** The functions accept any
integers, but the scores of the web application come from fixed rules: the
dependents of a package are the packages whose latest non-yanked release
depends on it, a dependent is recent when the dependency first appeared in
the last 180 days, and the signals 30 days ago are counted from the releases
published by then. The [`metrics` package](metrics.md) applies these rules
to a list of release records; its [tutorial](metrics.md) builds a report
from a few releases.

**Keep the population whole.** Positions and labels depend on every package
you pass. Scoring a filtered list, such as one owner's packages, gives
different labels from scoring the whole registry. Score the whole population
once and filter the snapshots afterwards.

**Compare scores, not labels, across time.** A label can change because
other packages moved. The momentum label compares a package's own score with
its score 30 days ago and does not depend on the population.

## Common pitfalls

- **Swapped fields.** All signals are `Int`, so the compiler cannot tell
  `downloads` from `external_dependents`. Name the fields in struct literals
  or helper functions, as above.
- **Days, not dates.** `days_since_release` is a count of whole days, not a
  timestamp. A negative value counts as `0` and gets the highest multiplier.
  Use `UNKNOWN_RELEASE_AGE_DAYS` when the release date is unknown.
- **Missing past signals mean `New`.** `None` in `past`, or a `past` array
  shorter than `current`, makes the package `New` with an earlier score of
  `0`. Pass the earlier signals whenever the package existed then.
- **Growth ratio of new packages.** A `score_growth_ratio_30d` of `1` can
  mean "doubled" or "appeared from nothing". Check `score_30d_ago == 0.0` to
  tell them apart.
- **Positions from another population.** `rank_label` trusts the position
  and the population you pass. Use positions computed by `rank_positions`
  over the same list.

## Next steps

- [score API](../api/score.md) for every function, constant and edge case.
- [score design](../design/score.md) for the reasons behind the formula,
  the weights and the thresholds.
- [metrics tutorial](metrics.md) to count signals from release records.
- [cli tutorial](cli.md) to build a report for the whole registry from a
  JSON file.
