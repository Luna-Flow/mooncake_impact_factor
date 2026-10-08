# score tutorial

This tutorial shows you how to compute the impact score of a MoonBit package
from its dependents, downloads and release date, how to turn the score into
the rank and momentum labels that the web application shows, and how to sort
and explain a list of scored packages. The mathematics stays light here; the
[score design](../design/score.md) derives it.

| I want to | Use |
| --- | --- |
| score one package | `@score.compute_score(dependents, recent, downloads, days)` |
| turn a score into a rank | `@score.rank_label(score)` |
| measure 30-day growth and momentum | `@score.compute_score_snapshot(...)` with current and historical signals |
| explain a score | score each signal alone; the parts add up |
| pass a snapshot to another tool | `Json(snapshot)`, or the [`cli` command](cli.md) |

## Quick start

Add the module to your project:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.1.2
```

Import the package in the `moon.pkg` of the package that uses it:

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/score",
}
```

Score a package with 20 dependents, 4 of them recent, 300 downloads and a
release 40 days ago:

```moonbit
test "quick start" {
  let score = @score.compute_score(20, 4, 300, 40)
  inspect(score, content="301.7852882193072")
  inspect(@score.rank_label(score), content="S")
}
```

The score is a plain `Double`. Anything from $260$ up is rank `S`.

## Everyday tasks

### Rank a list of packages

Scores from different packages are directly comparable, because each score
depends only on that package's signals. Sort by score, highest first, and break
ties by name so that the order is reproducible. This is the order the web
application uses for its top feed.

```moonbit
test "rank a list" {
  let packages = [
    ("alice/json", 40, 6, 1200, 20),
    ("bob/http", 12, 1, 90, 400),
    ("carol/csv", 12, 1, 90, 400),
    ("dave/math", 3, 0, 0, 15),
  ]
  let scored = packages.map(p => {
    let (name, deps, recent, downloads, days) = p
    (name, @score.compute_score(deps, recent, downloads, days))
  })
  scored.sort_by((a, b) => {
    let by_score = b.1.compare(a.1)
    if by_score != 0 { by_score } else { a.0.compare(b.0) }
  })
  let lines = scored.map(entry => {
    let (name, score) = entry
    "\{name} \{@score.rank_label(score)} \{score}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|alice/json S 391.6139680824188
      #|bob/http A 189.57132356978428
      #|carol/csv A 189.57132356978428
      #|dave/math C 59.00068800926255
    ),
  )
}
```

`bob/http` and `carol/csv` have identical signals and therefore identical
scores; the name decides their order.

### Explain where a score comes from

The base score is a sum of one term per signal, and the release multiplier
scales the whole sum. Scoring each signal on its own therefore splits a score
into its parts:

```moonbit
test "explain a score" {
  let (deps, recent, downloads, days) = (20, 4, 300, 40)
  let from_deps = @score.compute_score(deps, 0, 0, days)
  let from_recent = @score.compute_score(0, recent, 0, days)
  let from_downloads = @score.compute_score(0, 0, downloads, days)
  let total = @score.compute_score(deps, recent, downloads, days)
  inspect(from_deps, content="122.63336379149948")
  inspect(from_recent, content="46.06211305386395")
  inspect(from_downloads, content="133.08981137394377")
  inspect(total, content="301.7852882193072")
  assert_true((from_deps + from_recent + from_downloads - total).abs() < 1.0e-9)
}
```

The parts add up to the total up to rounding in the last digit, which is why
the check uses a tolerance instead of `==`.

### See the effect of release age

`activity_multiplier` rewards a recent release with up to 12 % and penalises
an old one with up to 12 %:

```moonbit
test "release age" {
  let lines = [10, 60, 120, 300, 500].map(days => {
    let score = @score.compute_score(20, 4, 300, days)
    "\{days} \{score} \{@score.rank_label(score)}"
  })
  inspect(
    lines.join("\n"),
    content=(
      #|10 318.8674743449284 S
      #|60 301.7852882193072 S
      #|120 284.703102093686 S
      #|300 267.6209159680649 S
      #|500 250.5387298424437 A
    ),
  )
}
```

The same signals are rank `S` while the latest release is less than a year
old and rank `A` after that.

### Measure growth over 30 days

`compute_score_snapshot` takes the four signals twice: as they are now and as
they were 30 days ago. A package that did not exist 30 days ago has historical
signals of `0`:

```moonbit
test "new package snapshot" {
  let snapshot = @score.compute_score_snapshot(8, 2, 120, 12, 0, 0, 0, 0)
  inspect(snapshot.score_growth_ratio_30d, content="1")
  inspect(snapshot.rank_label, content="A")
  inspect(snapshot.momentum_label, content="Hot")
}
```

The score grew from $0$, so the growth ratio is reported as $1$ (100 %). The
package is `Hot`, not `Rising`, because `Rising` needs at least three recent
dependents and it has two.

### Hand a snapshot to other tools

`ScoreSnapshot` converts to JSON with `Json(...)`. This is exactly the output
of the [`cli` command](cli.md):

```moonbit
test "snapshot as JSON" {
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  inspect(
    Json(snapshot).stringify(),
    content=(
      #|{"score":301.7852882193072,"score_30d_ago":135.2764584196223,"score_growth_30d":166.5088297996849,"score_growth_ratio_30d":1.2308780976744749,"rank_label":"S","momentum_label":"Rising","activity_multiplier":1.06}
    ),
  )
}
```

Read it back with `@json.from_json`, which needs `moonbitlang/core/json` in
your imports:

```moonbit
test "snapshot from JSON" {
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  let back : @score.ScoreSnapshot = @json.from_json(Json(snapshot))
  inspect(back.rank_label, content="S")
  assert_eq(Json(back), Json(snapshot))
}
```

`ScoreSnapshot` has no `Eq` implementation, so the check compares the JSON
forms.

## Going further

**Prepare signals like the index builder.** The functions accept any
integers, but the scores in the web application come from specific
definitions: `dependents` counts packages with at least one version that
depends on this package, `recent_dependents` counts those whose first such
version is at most 180 days old, and the historical signals repeat the count
as of 30 days ago with downloads set to `0`. The
[architecture guide](../architecture.md) describes the whole pipeline. If you
compare your own scores with the published ones, use the same definitions.

**Keep labels and scores together.** `rank_label` and
`compute_momentum_label` are separate functions so that you can label scores
computed elsewhere, but `compute_score_snapshot` is the only way to get
labels that are guaranteed to match the numbers. Store snapshots rather than
recomputing labels from rounded numbers.

**Guard against overflow at the edge.** No real package has
`2147483647` dependents, but if your signals come from untrusted input,
clamp them first: a count of exactly `2147483647` makes the score `NaN`, which
ranks as `D`.

```moonbit
test "clamp untrusted counts" {
  let raw = 2147483647
  let safe = if raw > 1000000000 { 1000000000 } else { raw }
  assert_false(@score.compute_score(safe, 0, 0, 0).is_nan())
}
```

## Common pitfalls

- **Swapped arguments.** All signals are `Int`, so the compiler cannot tell
  `downloads` from `dependents`. Keep the order of the
  [signals table](../api/score.md#signals).
- **Days, not dates.** `days_since_release` is a count of whole days, not a
  timestamp. A negative value counts as `0` and gets the highest multiplier.
- **Growth ratio of new packages.** A ratio of `1` can mean "doubled" or
  "appeared from nothing". Check `score_30d_ago == 0.0` to tell them apart.
- **Comparing with `==`.** Scores are floating-point numbers; compare
  computed sums with a tolerance.
- **Momentum needs the snapshot ratio.** `compute_momentum_label` trusts the
  ratio you pass. Passing a percentage (`35.0`) instead of a fraction
  (`0.35`) makes the ratio condition pass for any real growth.

## Next steps

- [score API](../api/score.md) for every function and threshold.
- [score design](../design/score.md) for the derivation of the formula, the
  rank thresholds in counts and the accuracy bounds.
- [cli tutorial](cli.md) to compute snapshots from Python or a shell.
- [static_search tutorial](static_search.md) to search the scored packages in
  the browser.
