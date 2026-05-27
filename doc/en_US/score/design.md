# Score Design

The current scoring model combines four signals:

- total package dependents
- recent dependents inside the rolling 180-day activity window
- optional download snapshot volume
- release recency multiplier

## Why These Inputs Exist

- Total dependents capture established ecosystem adoption.
- Recent dependents reward active new integration, not only historical weight.
- Download counts provide an external popularity hint when available.
- Release recency reduces stale-package bias without making age the primary
  ranking factor.

## Current Formula

```text
score =
  (ln(dependents + 1) * 38
   + ln(recent_dependents + 1) * 27
   + ln(downloads + 1) * 22)
  * activity_multiplier(days_since_release)
```

The logarithms intentionally compress very large packages so the ranking does
not become a pure dependent-count leaderboard.

## Current Release Multipliers

- `<= 30` days: `1.12`
- `<= 90` days: `1.06`
- `<= 180` days: `1.00`
- `<= 365` days: `0.94`
- `> 365` days: `0.88`

## Rank And Momentum Layers

Rank labels are coarse score buckets:

- `S >= 260`
- `A >= 180`
- `B >= 110`
- `C >= 50`
- `D < 50`

Momentum labels are computed by the Python index builder from score deltas:

- `Rising`: growth `>= 35`, ratio `>= 0.35`, recent dependents `>= 3`
- `Hot`: growth `>= 18`, ratio `>= 0.18`, recent dependents `>= 2`
- `Stable`: otherwise

Momentum is currently a serving concern rather than part of the exported
MoonBit API.

## Implementation Constraint

The repository intentionally keeps the same core score formula in Python and
MoonBit. Python owns database generation and historical comparisons, while
MoonBit exposes the computation needed for package consumers and future reuse.
