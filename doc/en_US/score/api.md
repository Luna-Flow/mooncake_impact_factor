# Score API

## Package

`Luna-Flow/mooncake-impact-factor/score`

## Public Functions

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
