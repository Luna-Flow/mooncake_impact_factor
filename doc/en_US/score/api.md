# Score API

## Package

`Luna-Flow/mooncake-impact-factor/score`

## Exported MoonBit Functions

### `clamp_non_negative(value : Int) -> Int`

Returns `0` for negative inputs and otherwise returns the original integer.

Current intent:

- keep score inputs safe before logarithmic transforms
- expose a small reusable helper for callers that mirror Python-side logic

### `compute_score(dependents : Int, recent_dependents : Int, downloads : Int, days_since_release : Int) -> Double`

Computes the package impact score from dependency count, recent dependency
growth, optional download snapshot data, and release recency.

Current formula:

```text
(ln(dependents + 1) * 38
 + ln(recent_dependents + 1) * 27
 + ln(downloads + 1) * 22)
* activity_multiplier(days_since_release)
```

Input semantics:

- `dependents`: total reverse-dependent package count
- `recent_dependents`: reverse dependents first seen in the rolling recent window
- `downloads`: non-negative download snapshot count
- `days_since_release`: days since the package's latest release

Behavior notes:

- negative inputs are clamped to `0`
- the return value is a raw floating-point score
- the MoonBit implementation intentionally matches the Python builder formula

### `rank_label(score : Double) -> String`

Maps a computed score to one of `S`, `A`, `B`, `C`, or `D`.

Current thresholds:

- `S`: `score >= 260.0`
- `A`: `score >= 180.0`
- `B`: `score >= 110.0`
- `C`: `score >= 50.0`
- `D`: otherwise

### `compute_momentum_label(score : Double, score_30d_ago : Double, growth_ratio : Double, recent_dependents : Int) -> String`

Maps a score delta profile to `Rising`, `Hot`, or `Stable`.

### `compute_score_snapshot(...) -> ScoreSnapshot`

Returns the current score snapshot, historical comparison fields, rank label,
momentum label, and activity multiplier in a single MoonBit call.

## Stable HTTP Endpoints

### `GET /api/feeds/top?limit=<n>`

Returns top-ranked packages ordered by current score.

### `GET /api/feeds/hot?limit=<n>`

Returns packages with the strongest current hot momentum profile.

### `GET /api/feeds/rising?limit=<n>`

Returns packages with the strongest current rising momentum profile.

### `GET /api/search?...`

Returns `{ "items": [...] }` with ranked package summaries.

Stable query parameters:

- `q`
- `limit`
- `owner`
- `package`
- `keyword`
- `description`
- `license`
- `repository`
- `rank`
- `momentum`
- `min_score`
- `max_score`
- `min_dependents`
- `min_recent_dependents`
- `min_downloads`
- `from_year`
- `to_year`
- `has_repository`
- `has_license`
- `sort`
- `order`

### `GET /api/packages/<owner>/<packageName>/analysis`

Returns `{ "detail": ..., "dependents": [...] }` for a single package.
