# Score tutorial

This tutorial computes the impact score of one package from its dependency,
download, and release signals, and then reads the rank and momentum labels
that the web application displays.

## Import the package

Add the score package to the `import` list of your `moon.pkg`:

```text
import {
  "Luna-Flow/mooncake-impact-factor/score",
}
```

## Compute a score

`compute_score` takes the total dependents, the recent dependents, the
download count, and the days since the latest release. Negative inputs are
clamped to `0`.

```moonbit
test "score a package" {
  let score = @score.compute_score(20, 4, 300, 40)
  inspect(@score.rank_label(score), content="S")
}
```

The score is a raw floating-point value. `rank_label` turns it into one of the
coarse buckets `S`, `A`, `B`, `C`, or `D`.

## Compare with 30 days ago

`compute_score_snapshot` takes the same four signals twice: first for today,
then for the state 30 days earlier. It returns a `ScoreSnapshot` with both
scores, the growth, the rank label, the momentum label, and the activity
multiplier.

```moonbit
test "snapshot a package" {
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  inspect(snapshot.rank_label, content="S")
  inspect(snapshot.momentum_label, content="Rising")
}
```

The package is `Rising` because its score grew by more than 35 points and 35
percent, and it gained at least three recent dependents.

## Use the score from other languages

The index builder does not reimplement the formula. It builds the `cli`
package for the JS target and passes the same eight signals as a JSON object:

```bash
moon build src/cli --target js
node _build/js/debug/build/cli/cli.js score-snapshot --input payload.json
```

The command prints the snapshot as JSON, or an object with an `error` field
when the input is missing or malformed.

## Next steps

Read the [design note](../design/score.md) for why each signal is weighted as
it is, and the [API reference](../api/score.md) for the thresholds behind
every label.
