# score API

The package `Luna-Flow/mooncake-impact-factor/score` computes the impact score
of a MoonBit package from four integer signals, labels the score with a rank
and a momentum class, and bundles everything into a `ScoreSnapshot`. Every
function is pure and total: it never aborts and has no hidden state.

Source: [`src/score/impact_factor.mbt`](../../../src/score/impact_factor.mbt).
The mathematics behind the formula is in the [score design](../design/score.md).

Import the package in `moon.pkg`:

```text
import {
  "Luna-Flow/mooncake-impact-factor/score",
}
```

## Signals

Every scoring function takes the same four signals, in this order:

| Parameter | Meaning |
| --- | --- |
| `dependents` | Number of packages that depend on this package. |
| `recent_dependents` | Number of those dependents that first appeared in the recent window. |
| `downloads` | Download count, or `0` when unknown. |
| `days_since_release` | Whole days since the latest release. |

The functions do not check that the signals are consistent, for example that
`recent_dependents <= dependents`. Negative values are clamped to `0`. The
index builder fills the signals from a local registry snapshot; see the
[architecture guide](../architecture.md).

## Scores

### `compute_score`

`compute_score` returns the impact score of a package.

```mbti
pub fn compute_score(Int, Int, Int, Int) -> Double
```

With $\sigma(n) = \ln(1 + \max(n, 0))$, $D$ dependents, $R$ recent dependents,
$W$ downloads and $t$ days since release, the result is

$$
S = m(t)\,\bigl(38\,\sigma(D) + 27\,\sigma(R) + 22\,\sigma(W)\bigr)
$$

where $m(t)$ is `activity_multiplier(t)`. The score is $0$ exactly when all
three counts are $0$ or negative, and it never decreases when a count grows.
It has no upper limit by design, but for counts below $2^{31} - 1$ it stays
below about $2094$.

> [!WARNING]
> A count equal to `2147483647` (the largest `Int`) overflows when $1$ is
> added, and the score becomes `NaN`. Real registry counts are far below this.

```moonbit
test "compute_score" {
  let score = @score.compute_score(20, 4, 300, 40)
  inspect(score, content="301.7852882193072")
  inspect(@score.compute_score(0, 0, 0, 10), content="0")
}
```

### `activity_multiplier`

`activity_multiplier` returns the release-recency factor $m(t)$ applied to the
whole score.

```mbti
pub fn activity_multiplier(Int) -> Double
```

A negative `days_since_release` counts as `0`.

| Days since release | Multiplier |
| --- | --- |
| `0` to `30` | `1.12` |
| `31` to `90` | `1.06` |
| `91` to `180` | `1.0` |
| `181` to `365` | `0.94` |
| `366` or more | `0.88` |

```moonbit
test "activity_multiplier" {
  inspect(@score.activity_multiplier(-3), content="1.12")
  inspect(@score.activity_multiplier(90), content="1.06")
  inspect(@score.activity_multiplier(400), content="0.88")
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
  inspect(@score.clamp_non_negative(12), content="12")
}
```

## Labels

### `rank_label`

`rank_label` maps a score to one of the rank buckets `S`, `A`, `B`, `C` and
`D`.

```mbti
pub fn rank_label(Double) -> String
```

| Rank | Condition |
| --- | --- |
| `S` | `score >= 260.0` |
| `A` | `180.0 <= score < 260.0` |
| `B` | `110.0 <= score < 180.0` |
| `C` | `50.0 <= score < 110.0` |
| `D` | `score < 50.0`, or `score` is `NaN` |

```moonbit
test "rank_label" {
  inspect(@score.rank_label(260.0), content="S")
  inspect(@score.rank_label(259.99), content="A")
  inspect(@score.rank_label(12.0), content="D")
}
```

### `compute_momentum_label`

`compute_momentum_label` classifies how fast a score grew as `Rising`, `Hot`
or `Stable`.

```mbti
pub fn compute_momentum_label(Double, Double, Double, Int) -> String
```

The arguments are the current score $S$, the score 30 days ago $S_{30}$, the
growth ratio $r$ and the number of recent dependents $R$. With the growth
$G = S - S_{30}$:

| Label | Condition |
| --- | --- |
| `Rising` | $G \ge 35$ and $r \ge 0.35$ and $R \ge 3$ |
| `Hot` | not `Rising`, and $G \ge 18$ and $r \ge 0.18$ and $R \ge 2$ |
| `Stable` | otherwise, including any `NaN` argument |

The function does not check that `growth_ratio` matches the two scores;
`compute_score_snapshot` computes it for you.

```moonbit
test "compute_momentum_label" {
  inspect(@score.compute_momentum_label(140.0, 100.0, 0.4, 3), content="Rising")
  inspect(@score.compute_momentum_label(140.0, 100.0, 0.4, 2), content="Hot")
  inspect(@score.compute_momentum_label(105.0, 100.0, 0.05, 1), content="Stable")
}
```

## Snapshots

### `ScoreSnapshot`

`ScoreSnapshot` is the full result of scoring one package at one point in
time.

```mbti
pub struct ScoreSnapshot {
  score : Double
  score_30d_ago : Double
  score_growth_30d : Double
  score_growth_ratio_30d : Double
  rank_label : String
  momentum_label : String
  activity_multiplier : Double
} derive(ToJson, @debug.Debug, @json.FromJson)
```

| Field | Meaning |
| --- | --- |
| `score` | The current score $S$. |
| `score_30d_ago` | The score $S_{30}$ computed from the historical signals. |
| `score_growth_30d` | $G = S - S_{30}$; negative when the score fell. |
| `score_growth_ratio_30d` | $G / S_{30}$ when $S_{30} > 0$; otherwise $1$ when $G > 0$ and $0$ when $G \le 0$. |
| `rank_label` | `rank_label(score)`. |
| `momentum_label` | `compute_momentum_label(score, score_30d_ago, score_growth_ratio_30d, recent_dependents)`. |
| `activity_multiplier` | `activity_multiplier(days_since_release)` for the current signals. |

The fields are read-only outside the package; build a snapshot with
`compute_score_snapshot`. `ToJson` writes an object whose keys are the field
names, which is the output format of the [`cli` command](cli.md). `FromJson`
reads the same format back and raises `@json.JsonDecodeError` when a field is
missing or has the wrong type. `Debug` supports `debug_inspect` and
`Repr(...)`. The struct does not implement `Eq`; compare snapshots through
their fields or their JSON form.

```moonbit
test "ScoreSnapshot JSON round trip" {
  let snapshot = @score.compute_score_snapshot(8, 2, 120, 12, 0, 0, 0, 0)
  let json = Json(snapshot)
  let back : @score.ScoreSnapshot = @json.from_json(json)
  assert_eq(Json(back), json)
  inspect(back.momentum_label, content="Hot")
}
```

### `compute_score_snapshot`

`compute_score_snapshot` scores a package now and 30 days ago, and derives the
growth, both labels and the multiplier in one call.

```mbti
pub fn compute_score_snapshot(Int, Int, Int, Int, Int, Int, Int, Int) -> ScoreSnapshot
```

The first four arguments are the current signals, the last four the signals
as they were 30 days ago, both in the order of the [signals table](#signals):

```moonbit nocheck
compute_score_snapshot(
  dependents, recent_dependents, downloads, days_since_release,
  historical_dependents, historical_recent_dependents,
  historical_downloads, historical_days_since_release,
)
```

The momentum label uses the current `recent_dependents`. A package that did
not exist 30 days ago is described by historical signals of `0`; its
`score_30d_ago` is then $0$ and its growth ratio is $1$.

```moonbit
test "compute_score_snapshot" {
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  debug_inspect(
    snapshot,
    content=(
      #|{
      #|  score: 301.7852882193072,
      #|  score_30d_ago: 135.2764584196223,
      #|  score_growth_30d: 166.5088297996849,
      #|  score_growth_ratio_30d: 1.2308780976744749,
      #|  rank_label: "S",
      #|  momentum_label: "Rising",
      #|  activity_multiplier: 1.06,
      #|}
    ),
  )
}
```

## Deprecated

`ScoreSnapshot` still has three methods that earlier MoonBit versions created
implicitly from its derived traits. They are hidden from the interface file
and warn when used.

| Deprecated | Use instead |
| --- | --- |
| `ScoreSnapshot::to_json(s)` | `Json(s)` |
| `ScoreSnapshot::from_json(json, path)` | `@json.from_json(json)` |
| `ScoreSnapshot::to_repr(s)` | `Repr(s)`, `debug_inspect` or `@debug.to_string` |
