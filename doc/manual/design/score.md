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
- Release recency reduces stale-package bias without making age the primary ranking factor.

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

Momentum labels use score-delta rules exported from MoonBit and are materialized
by the Python index builder:

- `Rising`: growth `>= 35`, ratio `>= 0.35`, recent dependents `>= 3`
- `Hot`: growth `>= 18`, ratio `>= 0.18`, recent dependents `>= 2`
- `Stable`: otherwise

The build pipeline persists momentum labels for serving, while MoonBit remains
the source of truth for the rule definitions.

## Data Flow

1. `scripts/build_index.py` reads local `*.index` records from the MoonBit registry snapshot.
2. The builder reconstructs packages, versions, dependencies, package edges, and the FTS search index in SQLite.
3. The Python pipeline calls the local MoonBit CLI to compute score snapshots, rank labels, activity multipliers, and momentum labels.
4. `src/score` exposes the score, rank, momentum, and snapshot logic for MoonBit consumers and local CLI reuse.
5. `lib/query.ts` defines the shared query AST, native-expression parser, serializer, and compatibility helpers used by both server and client.
6. The Next.js app reads the generated SQLite database and serves feeds, search results, advanced query building, and package analysis views.

## Implementation Constraint

The repository intentionally keeps Python responsible for database generation
and SQLite materialization, while MoonBit owns the reusable score, rank,
momentum, and snapshot rules that the local CLI forwards into the build flow.
