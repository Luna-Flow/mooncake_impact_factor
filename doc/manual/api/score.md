# score API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/score` turns the measured
signals of a MoonBit package into an impact score, ranks the score within a
population of packages, and labels its change over 30 days. Every function is
pure and total: it never aborts, has no hidden state and returns the same bits
on every backend.

The package does not measure anything. It does not know what a release, a
dependency or a registry is; the [`metrics` package](metrics.md) counts the
signals from release records and calls this package. The reasoning behind the
formula, the weights and the thresholds is in the
[score design](../design/score.md).

Source: [`src/score/impact_factor.mbt`](../../../src/score/impact_factor.mbt)
and [`src/score/log.mbt`](../../../src/score/log.mbt).

## Importing

Add the package to the `moon.pkg` of the package that uses it. The examples
on this page call it as `@score`; the JSON examples also import
`moonbitlang/core/json`.

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/score",
  "moonbitlang/core/json",
}
```

The derived traits of the three structs are used as traits: `Json(value)`
converts to JSON, `@json.from_json(json)` converts back, `debug_inspect` and
`Repr(value)` print a value, and `==` compares two `Signals`. The methods
that older compilers created implicitly from derived traits, such as
`to_json`, are not part of the interface.

## Overview

| Group | Items |
| --- | --- |
| [Signals](#signals) | `Signals`, `clamp_non_negative`, `UNKNOWN_RELEASE_AGE_DAYS` |
| [Score](#score) | `compute_score`, `score_breakdown`, `ScoreBreakdown`, `DEPENDENTS_WEIGHT`, `RECENT_DEPENDENTS_WEIGHT`, `DOWNLOADS_WEIGHT` |
| [Score terms](#score-terms) | `weighted_dependents`, `SELF_DEPENDENT_WEIGHT`, `log_signal`, `ln`, `activity_multiplier` |
| [Ranks](#ranks) | `rank_positions`, `rank_label`, `rank_labels` |
| [Momentum](#momentum) | `compute_momentum_label`, `momentum_labels`, `MOMENTUM_MIN_CHANGE`, `MOMENTUM_MIN_RATIO` |
| [Populations](#populations) | `score_population`, `ScoreSnapshot` |

## Signals

### `Signals`

`Signals` holds the six measured signals of one package at one point in time.

```mbti
pub(all) struct Signals {
  external_dependents : Int
  self_dependents : Int
  recent_external_dependents : Int
  recent_self_dependents : Int
  downloads : Int
  days_since_release : Int
} derive(Eq, ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `external_dependents` | Packages of other owners whose latest release depends on this package. |
| `self_dependents` | Packages of the same owner whose latest release depends on this package. |
| `recent_external_dependents` | The external dependents whose dependency first appeared in the last 180 days. |
| `recent_self_dependents` | The same-owner dependents whose dependency first appeared in the last 180 days. |
| `downloads` | Download count, `0` when unknown. |
| `days_since_release` | Whole days since the latest release; `UNKNOWN_RELEASE_AGE_DAYS` when the date is unknown. |

The meanings are those that [`@metrics.compute`](metrics.md#compute) fills
in; the functions of this package treat the fields as plain integers. They do
not check that the signals are consistent, for example that the recent
dependents are at most the dependents. Every function clamps a negative field
to `0` before it uses it.

The struct is `pub(all)`, so you build it with a struct literal. `ToJson`
writes an object with the field names as keys; `FromJson` reads it back and
raises `@json.JsonDecodeError` when a field is missing, is not a number, or
does not fit in an `Int`. A fractional number is truncated.

```moonbit
test "Signals" {
  let signals : @score.Signals = {
    external_dependents: 12,
    self_dependents: 4,
    recent_external_dependents: 3,
    recent_self_dependents: 0,
    downloads: 850,
    days_since_release: 45,
  }
  inspect(
    Json(signals).stringify(),
    content=(
      #|{"external_dependents":12,"self_dependents":4,"recent_external_dependents":3,"recent_self_dependents":0,"downloads":850,"days_since_release":45}
    ),
  )
  let back : @score.Signals = @json.from_json(Json(signals))
  assert_eq(back, signals)
  assert_true(back != { ..signals, downloads: 851 })
}
```

### `clamp_non_negative`

`clamp_non_negative` returns `value` when it is non-negative and `0`
otherwise.

```mbti
pub fn clamp_non_negative(Int) -> Int
```

The scoring functions apply it to every signal. It is public so that callers
can prepare signals the same way.

```moonbit
test "clamp_non_negative" {
  inspect(@score.clamp_non_negative(-7), content="0")
  inspect(@score.clamp_non_negative(0), content="0")
  inspect(@score.clamp_non_negative(12), content="12")
}
```

### `UNKNOWN_RELEASE_AGE_DAYS`

`UNKNOWN_RELEASE_AGE_DAYS` is the value of `days_since_release` for a package
whose release date is unknown.

```mbti
pub const UNKNOWN_RELEASE_AGE_DAYS : Int = 3650
```

Ten years is far beyond the 365 days after which the multiplier stops
falling, so an undated package gets the lowest multiplier, `0.88`.

```moonbit
test "UNKNOWN_RELEASE_AGE_DAYS" {
  inspect(@score.UNKNOWN_RELEASE_AGE_DAYS, content="3650")
  inspect(
    @score.activity_multiplier(@score.UNKNOWN_RELEASE_AGE_DAYS),
    content="0.88",
  )
}
```

## Score

### `compute_score`

`compute_score` returns the impact score of one package.

```mbti
pub fn compute_score(Signals) -> Double
```

With $\sigma(x) = \ln(1 + \max(x, 0))$, the weighted dependents
$D = E + \tfrac14 O$ (external $E$, same owner $O$), the weighted recent
dependents $R$ formed the same way, the downloads $W$ and the days since
release $t$, the score is

$$
S = m(t)\,\bigl(38\,\sigma(D) + 27\,\sigma(R) + 22\,\sigma(W)\bigr)
$$

where $m(t)$ is [`activity_multiplier`](#activity_multiplier). It equals
`(b.dependents + b.recent_dependents + b.downloads) * b.multiplier` for
`b = score_breakdown(signals)`, bit for bit.

The score is finite and non-negative for every input. It is `0` exactly when
all five counts are `0` or negative, and it never decreases when a count
grows or the release becomes more recent. It has no fixed upper limit; with
every count at the largest `Int` it is about `2110`. Scores are comparable
across packages because each depends only on that package's signals; the
rank and the momentum label depend on the population.

```moonbit
test "compute_score" {
  let signals : @score.Signals = {
    external_dependents: 12,
    self_dependents: 4,
    recent_external_dependents: 3,
    recent_self_dependents: 0,
    downloads: 850,
    days_since_release: 45,
  }
  inspect(@score.compute_score(signals), content="317.3965306194994")
  let nothing : @score.Signals = {
    external_dependents: 0,
    self_dependents: -2,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 5,
  }
  inspect(@score.compute_score(nothing), content="0")
}
```

### `score_breakdown`

`score_breakdown` returns the three weighted terms of the base score and the
multiplier, so that a reader can see where a score comes from.

```mbti
pub fn score_breakdown(Signals) -> ScoreBreakdown
```

The fields of the result are

| Field | Value |
| --- | --- |
| `dependents` | $38\,\sigma(D)$ |
| `recent_dependents` | $27\,\sigma(R)$ |
| `downloads` | $22\,\sigma(W)$ |
| `multiplier` | $m(t)$ |

with the notation of [`compute_score`](#compute_score). Each term is
non-negative and the multiplier lies in $[0.88, 1.12]$.

```moonbit
test "score_breakdown" {
  let signals : @score.Signals = {
    external_dependents: 12,
    self_dependents: 4,
    recent_external_dependents: 3,
    recent_self_dependents: 0,
    downloads: 850,
    days_since_release: 45,
  }
  let b = @score.score_breakdown(signals)
  debug_inspect(
    b,
    content=(
      #|{
      #|  dependents: 100.28417852537982,
      #|  recent_dependents: 37.42994775023705,
      #|  downloads: 148.42106682861424,
      #|  multiplier: 1.1092537313432838,
      #|}
    ),
  )
  let total = (b.dependents + b.recent_dependents + b.downloads) * b.multiplier
  assert_eq(total, @score.compute_score(signals))
}
```

### `ScoreBreakdown`

`ScoreBreakdown` is the result of `score_breakdown`.

```mbti
pub struct ScoreBreakdown {
  dependents : Double
  recent_dependents : Double
  downloads : Double
  multiplier : Double
} derive(ToJson, @debug.Debug, @json.FromJson)
```

The fields are read-only outside the package; you obtain a value from
`score_breakdown` or from the `breakdown` field of a
[`ScoreSnapshot`](#scoresnapshot). `ToJson` and `FromJson` use the field
names as keys. The struct does not implement `Eq`; compare the fields or the
JSON forms.

```moonbit
test "ScoreBreakdown JSON" {
  let signals : @score.Signals = {
    external_dependents: 1,
    self_dependents: 0,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 400,
  }
  let b = @score.score_breakdown(signals)
  inspect(
    Json(b).stringify(),
    content=(
      #|{"dependents":26.33959286127792,"recent_dependents":0,"downloads":0,"multiplier":0.88}
    ),
  )
  let back : @score.ScoreBreakdown = @json.from_json(Json(b))
  assert_eq(Json(back), Json(b))
}
```

### `DEPENDENTS_WEIGHT`

`DEPENDENTS_WEIGHT` is the weight of the dependents term of the base score.

```mbti
pub const DEPENDENTS_WEIGHT : Double = 38.0
```

A term is its weight times the logarithmic signal, so the weight is the
score gained, before the multiplier, each time the signal plus one grows by
the factor $e$. The dependents term has the largest weight of the three.

```moonbit
test "DEPENDENTS_WEIGHT" {
  let signals : @score.Signals = {
    external_dependents: 1,
    self_dependents: 0,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 100,
  }
  let b = @score.score_breakdown(signals)
  assert_eq(b.dependents, @score.DEPENDENTS_WEIGHT * @score.ln(2.0))
  inspect(b.dependents, content="26.33959286127792")
}
```

### `RECENT_DEPENDENTS_WEIGHT`

`RECENT_DEPENDENTS_WEIGHT` is the weight of the recent-dependents term of the
base score.

```mbti
pub const RECENT_DEPENDENTS_WEIGHT : Double = 27.0
```

A recent dependent also counts in the dependents term, so it adds to both
terms.

```moonbit
test "RECENT_DEPENDENTS_WEIGHT" {
  let signals : @score.Signals = {
    external_dependents: 1,
    self_dependents: 0,
    recent_external_dependents: 1,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 100,
  }
  let b = @score.score_breakdown(signals)
  assert_eq(b.recent_dependents, @score.RECENT_DEPENDENTS_WEIGHT * @score.ln(2.0))
  inspect(b.dependents + b.recent_dependents, content="45.054566736396445")
}
```

### `DOWNLOADS_WEIGHT`

`DOWNLOADS_WEIGHT` is the weight of the downloads term of the base score.

```mbti
pub const DOWNLOADS_WEIGHT : Double = 22.0
```

It is the smallest of the three weights. Downloads count only through their
logarithm: 999 downloads give $22 \ln 1000 \approx 152$.

```moonbit
test "DOWNLOADS_WEIGHT" {
  let signals : @score.Signals = {
    external_dependents: 0,
    self_dependents: 0,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 999,
    days_since_release: 100,
  }
  let b = @score.score_breakdown(signals)
  assert_eq(b.downloads, @score.DOWNLOADS_WEIGHT * @score.ln(1000.0))
  inspect(b.downloads, content="151.970616137607")
}
```

## Score terms

### `weighted_dependents`

`weighted_dependents` returns the dependent count that enters the score:
external dependents count once, dependents of the same owner count
`SELF_DEPENDENT_WEIGHT`.

```mbti
pub fn weighted_dependents(Int, Int) -> Double
```

The arguments are the external and the same-owner count, in this order.
Each is clamped to `0` first. The result is exact, because a quarter of an
`Int` is representable as a `Double`.

```moonbit
test "weighted_dependents" {
  inspect(@score.weighted_dependents(3, 4), content="4")
  inspect(@score.weighted_dependents(0, 1), content="0.25")
  inspect(@score.weighted_dependents(-5, 2), content="0.5")
}
```

### `SELF_DEPENDENT_WEIGHT`

`SELF_DEPENDENT_WEIGHT` is the weight of a dependent published by the same
owner as the package it depends on.

```mbti
pub const SELF_DEPENDENT_WEIGHT : Double = 0.25
```

An owner who splits one project into many packages adds one dependent per
package. Counting each of them fully would let a package rank on its
author's own reuse, so four same-owner dependents weigh as much as one
external dependent.

```moonbit
test "SELF_DEPENDENT_WEIGHT" {
  let own : @score.Signals = {
    external_dependents: 0,
    self_dependents: 8,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 100,
  }
  let external = { ..own, external_dependents: 2, self_dependents: 0 }
  assert_eq(@score.compute_score(own), @score.compute_score(external))
  inspect(@score.SELF_DEPENDENT_WEIGHT * 4.0, content="1")
}
```

### `log_signal`

`log_signal` returns $\sigma(x) = \ln(1 + x)$ for $x > 0$ and `0` otherwise.

```mbti
pub fn log_signal(Double) -> Double
```

Zero, negative values, `-Infinity` and `NaN` all give `0`; `+Infinity` gives
`+Infinity`. The function uses [`ln`](#ln), so it returns the same bits on
every backend.

```moonbit
test "log_signal" {
  inspect(@score.log_signal(0.0), content="0")
  inspect(@score.log_signal(-3.0), content="0")
  inspect(@score.log_signal(0.0 / 0.0), content="0")
  inspect(@score.log_signal(1.0), content="0.6931471805599453")
  inspect(@score.log_signal(850.0), content="6.7464121285733745")
}
```

### `ln`

`ln` returns the natural logarithm of `x`.

```mbti
pub fn ln(Double) -> Double
```

The function is a port of the fdlibm `e_log.c` routine built only from IEEE
754 basic operations and bit manipulation. Its error is below one unit in
the last place, and, unlike `@math.ln`, which calls the platform's `Math.log`
on the JavaScript backend, it returns the same bits on every backend, so
scores and ranks do not depend on the backend. The special values follow
IEEE 754:

| Input | Result |
| --- | --- |
| `+0.0` or `-0.0` | `-Infinity` |
| negative, including `-Infinity` | `NaN` |
| `+Infinity` | `+Infinity` |
| `NaN` | `NaN` |
| subnormal | finite, for example `ln(5.0e-324)` is about `-744.44` |

```moonbit
test "ln" {
  inspect(@score.ln(1.0), content="0")
  inspect(@score.ln(2.0), content="0.6931471805599453")
  inspect(@score.ln(10.0), content="2.302585092994046")
  inspect(@score.ln(0.0), content="-Infinity")
  inspect(@score.ln(-1.0).is_nan(), content="true")
  inspect(@score.ln(5.0e-324), content="-744.4400719213812")
}
```

### `activity_multiplier`

`activity_multiplier` returns the release-recency factor $m(t)$ that scales
the whole base score.

```mbti
pub fn activity_multiplier(Int) -> Double
```

$$
m(t) = \begin{cases}
1.12 & t \le 30 \\
1.12 - 0.24\,\dfrac{t - 30}{335} & 30 < t < 365 \\
0.88 & t \ge 365
\end{cases}
$$

A negative `days_since_release` counts as `0`. The function is continuous
and non-increasing; it is `1.0` near 197.5 days, halfway through the slope.

```moonbit
test "activity_multiplier" {
  inspect(@score.activity_multiplier(-3), content="1.12")
  inspect(@score.activity_multiplier(30), content="1.12")
  inspect(@score.activity_multiplier(31), content="1.1192835820895524")
  inspect(@score.activity_multiplier(200), content="0.9982089552238808")
  inspect(@score.activity_multiplier(365), content="0.88")
  inspect(@score.activity_multiplier(5000), content="0.88")
}
```

## Ranks

### `rank_positions`

`rank_positions` returns the competition rank of every score, best first.

```mbti
pub fn rank_positions(ArrayView[Double]) -> Array[Int]
```

The position of a score is one plus the number of strictly greater scores,
so equal scores share a position and the next position is skipped ("1, 2, 2,
4"). The result has the same length and order as the input. `NaN` counts as
smaller than every number, and all `NaN` values share the last position.
`0.0` and `-0.0` are equal. An empty view gives an empty array.

```moonbit
test "rank_positions" {
  debug_inspect(
    @score.rank_positions([5.0, 9.0, 5.0, 1.0, 0.0 / 0.0][:]),
    content="[2, 1, 2, 4, 5]",
  )
  debug_inspect(@score.rank_positions([][:]), content="[]")
}
```

### `rank_label`

`rank_label` returns the rank label `S`, `A`, `B`, `C` or `D` of a package at
competition position `position` (`1` is best) among `population` packages.

```mbti
pub fn rank_label(Int, Int, Double) -> String
```

The arguments are the position, the population and the package's score. With
$q = (\text{position} - 1) / \text{population}$, the share of the population
that scores strictly higher:

| Label | Condition |
| --- | --- |
| `S` | $q < 5\%$ |
| `A` | $5\% \le q < 15\%$ |
| `B` | $15\% \le q < 35\%$ |
| `C` | $35\% \le q < 65\%$ |
| `D` | $q \ge 65\%$ |

A package without any signal is always `D`: the label is `D` when `score` is
`0`, negative or `NaN`, whatever its position. It is also `D` when
`population` or `position` is `0` or negative. Tied packages share a
position and therefore a label. Use the positions from `rank_positions` over
the same population; the function does not check that `position` is at most
`population`.

```moonbit
test "rank_label" {
  inspect(@score.rank_label(1, 100, 50.0), content="S")
  inspect(@score.rank_label(5, 100, 50.0), content="S")
  inspect(@score.rank_label(6, 100, 50.0), content="A")
  inspect(@score.rank_label(36, 100, 50.0), content="C")
  inspect(@score.rank_label(66, 100, 50.0), content="D")
  inspect(@score.rank_label(1, 100, 0.0), content="D")
  inspect(@score.rank_label(1, 1, 3.5), content="S")
}
```

### `rank_labels`

`rank_labels` returns the rank labels, best first.

```mbti
pub fn rank_labels() -> Array[String]
```

The result is `["S", "A", "B", "C", "D"]`, and every result of `rank_label`
is one of its elements. Each call returns a new array, so changing it does
not affect later calls. The query language and the search take the labels
from here instead of repeating them.

```moonbit
test "rank_labels" {
  let labels = @score.rank_labels()
  debug_inspect(
    labels,
    content=(
      #|["S", "A", "B", "C", "D"]
    ),
  )
  for position in [1, 6, 16, 36, 66] {
    assert_true(labels.contains(@score.rank_label(position, 100, 1.0)))
  }
}
```

## Momentum

### `compute_momentum_label`

`compute_momentum_label` returns `New`, `Rising`, `Cooling` or `Stable` from a
package's score now and 30 days ago.

```mbti
pub fn compute_momentum_label(Double, Double?) -> String
```

The second argument is `None` when the package had no release 30 days ago.
With the change $G = S - S_{30}$ and the threshold
$T = \max(\texttt{MOMENTUM\_MIN\_CHANGE},\ \texttt{MOMENTUM\_MIN\_RATIO} \cdot S_{30})$:

| Label | Condition |
| --- | --- |
| `New` | `score_30d_ago` is `None` |
| `Rising` | $G \ge T$ |
| `Cooling` | $G \le -T$ |
| `Stable` | otherwise |

The threshold is at least 10 points and at least 10 % of the earlier score,
so a large package needs a large change and a small one cannot change its
label with a handful of points. A `NaN` score or earlier score gives
`Stable`, unless the earlier score is `None`.

```moonbit
test "compute_momentum_label" {
  inspect(@score.compute_momentum_label(50.0, None), content="New")
  inspect(@score.compute_momentum_label(120.0, Some(100.0)), content="Rising")
  inspect(@score.compute_momentum_label(105.0, Some(100.0)), content="Stable")
  inspect(@score.compute_momentum_label(85.0, Some(100.0)), content="Cooling")
  // Fifteen points, but less than 10 % of 400.
  inspect(@score.compute_momentum_label(415.0, Some(400.0)), content="Stable")
  inspect(@score.compute_momentum_label(0.0 / 0.0, Some(1.0)), content="Stable")
}
```

### `momentum_labels`

`momentum_labels` returns the momentum labels.

```mbti
pub fn momentum_labels() -> Array[String]
```

The result is `["New", "Rising", "Stable", "Cooling"]`, and every result of
`compute_momentum_label` is one of its elements. Each call returns a new
array.

```moonbit
test "momentum_labels" {
  let labels = @score.momentum_labels()
  debug_inspect(
    labels,
    content=(
      #|["New", "Rising", "Stable", "Cooling"]
    ),
  )
  for past in [None, Some(100.0), Some(120.0), Some(200.0)] {
    assert_true(labels.contains(@score.compute_momentum_label(120.0, past)))
  }
}
```

### `MOMENTUM_MIN_CHANGE`

`MOMENTUM_MIN_CHANGE` is the smallest change of the score, in points, that
counts as momentum.

```mbti
pub const MOMENTUM_MIN_CHANGE : Double = 10.0
```

It decides the threshold while the earlier score is below 100.

```moonbit
test "MOMENTUM_MIN_CHANGE" {
  let past = 40.0
  let edge = past + @score.MOMENTUM_MIN_CHANGE
  inspect(@score.compute_momentum_label(edge, Some(past)), content="Rising")
  inspect(@score.compute_momentum_label(edge - 0.001, Some(past)), content="Stable")
}
```

### `MOMENTUM_MIN_RATIO`

`MOMENTUM_MIN_RATIO` is the smallest change of the score, as a share of its
value 30 days ago, that counts as momentum.

```mbti
pub const MOMENTUM_MIN_RATIO : Double = 0.1
```

It decides the threshold from an earlier score of 100 up.

```moonbit
test "MOMENTUM_MIN_RATIO" {
  let past = 300.0
  let edge = past * (1.0 + @score.MOMENTUM_MIN_RATIO)
  inspect(@score.compute_momentum_label(edge, Some(past)), content="Rising")
  inspect(@score.compute_momentum_label(past + 29.0, Some(past)), content="Stable")
}
```

## Populations

### `score_population`

`score_population` scores a whole population of packages and returns one
`ScoreSnapshot` per package.

```mbti
pub fn score_population(ArrayView[Signals], ArrayView[Signals?]) -> Array[ScoreSnapshot]
```

`current[i]` holds the signals of package `i` now, and `past[i]` its signals
30 days ago, or `None` when the package had no release then. The result has
the length and order of `current`. When `past` is shorter than `current`,
the missing entries count as `None`; extra entries are ignored.

The function computes every score with `compute_score`, the positions with
`rank_positions` over all current scores, and for package `i`:

- `rank_label` is `rank_label(position, current.length(), score)`;
- `score_30d_ago` is the score of `past[i]`, or `0` for `None`;
- `momentum_label` is `compute_momentum_label(score, past score)`, so a
  package with `None` is `New`.

Positions and labels are relative to the population you pass: the same
signals can be `S` in a small population and `C` in a large one. An empty
population gives an empty array.

```moonbit
test "score_population" {
  let base : @score.Signals = {
    external_dependents: 0,
    self_dependents: 0,
    recent_external_dependents: 0,
    recent_self_dependents: 0,
    downloads: 0,
    days_since_release: 100,
  }
  let current = [
    {
      ..base,
      external_dependents: 10,
      recent_external_dependents: 4,
      downloads: 1000,
      days_since_release: 10,
    },
    { ..base, external_dependents: 1, downloads: 10 },
    { ..base, external_dependents: 1, downloads: 10 },
    base,
  ]
  let past = [
    Some({
      ..base,
      external_dependents: 6,
      downloads: 1000,
      days_since_release: 40,
    }),
    Some({ ..base, external_dependents: 1, downloads: 10 }),
    None,
  ]
  let snapshots = @score.score_population(current[:], past[:])
  let lines = snapshots.map(s => {
    "\{s.rank_position} \{s.rank_label} \{s.momentum_label}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|1 S Rising
      #|2 B Stable
      #|2 B New
      #|4 D New
    ),
  )
}
```

The second and third packages tie and share position 2 and label `B`;
position 3 is skipped. The third package has no earlier signals and the
fourth falls beyond the end of `past`, so both are `New`. The fourth has no
signal at all and is `D` whatever its position.

### `ScoreSnapshot`

`ScoreSnapshot` is the full result of scoring one package within a
population.

```mbti
pub struct ScoreSnapshot {
  score : Double
  score_30d_ago : Double
  score_growth_30d : Double
  score_growth_ratio_30d : Double
  rank_label : String
  rank_position : Int
  momentum_label : String
  activity_multiplier : Double
  breakdown : ScoreBreakdown
} derive(ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `score` | The current score $S$. |
| `score_30d_ago` | The score $S_{30}$ of the signals 30 days ago; `0` when the package had no release then. |
| `score_growth_30d` | $G = S - S_{30}$; negative when the score fell. |
| `score_growth_ratio_30d` | $G / S_{30}$ when $S_{30} > 0$; otherwise `1` when $G > 0$ and `0` when $G \le 0$. |
| `rank_label` | `S`, `A`, `B`, `C` or `D`, see [`rank_label`](#rank_label). |
| `rank_position` | Competition position in the population, `1` is best. |
| `momentum_label` | `New`, `Rising`, `Cooling` or `Stable`, see [`compute_momentum_label`](#compute_momentum_label). |
| `activity_multiplier` | $m(t)$ of the current signals. |
| `breakdown` | `score_breakdown` of the current signals. |

The fields are read-only outside the package; build snapshots with
`score_population`. A growth ratio of `1` means either "doubled" or "grew
from nothing"; `score_30d_ago == 0.0` tells them apart. `ToJson` writes an
object with the field names as keys, in declaration order, and `breakdown`
as a nested object; this is the `snapshot` object of the
[`build-index` report](cli.md). `FromJson` reads the same form. The struct
does not implement `Eq`; compare the fields or the JSON forms.

```moonbit
test "ScoreSnapshot" {
  let now : @score.Signals = {
    external_dependents: 3,
    self_dependents: 2,
    recent_external_dependents: 1,
    recent_self_dependents: 0,
    downloads: 400,
    days_since_release: 12,
  }
  let snapshot = @score.score_population([now][:], [None][:])[0]
  debug_inspect(
    snapshot,
    content=(
      #|{
      #|  score: 232.66551431576485,
      #|  score_30d_ago: 0,
      #|  score_growth_30d: 232.66551431576485,
      #|  score_growth_ratio_30d: 1,
      #|  rank_label: "S",
      #|  rank_position: 1,
      #|  momentum_label: "New",
      #|  activity_multiplier: 1.12,
      #|  breakdown: {
      #|    dependents: 57.15494107749842,
      #|    recent_dependents: 18.714973875118524,
      #|    downloads: 131.86715140074452,
      #|    multiplier: 1.12,
      #|  },
      #|}
    ),
  )
  let back : @score.ScoreSnapshot = @json.from_json(Json(snapshot))
  assert_eq(Json(back), Json(snapshot))
}
```
