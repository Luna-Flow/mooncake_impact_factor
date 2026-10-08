# cli API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/cli` is an executable for the
JavaScript target. It reads the eight signals of a score snapshot from a JSON
file, calls [`compute_score_snapshot`](score.md#compute_score_snapshot) and
prints the result as JSON. It exists so that programs outside MoonBit, above
all the Python index builder, use the MoonBit score rules instead of copying
them.

Source: [`src/cli/main.mbt`](../../../src/cli/main.mbt). Its interface file is
empty: the package exports no MoonBit names, and its interface is the
command line described here.

## Building

The package cannot be imported: it is an executable with no exported names.
It declares `supported_targets = "js"` and
`pkgtype(kind: "executable")`. Build it from the repository root:

```bash
moon build src/cli --target js
```

The index builder expects the result at
`_build/js/debug/build/cli/cli.js` and builds it when the file is missing. The
script needs a Node.js version with `process.getBuiltinModule` (20.16, 22.3
or later).

## `score-snapshot`

`score-snapshot` computes one score snapshot from a JSON input file.

```text
node cli.js score-snapshot --input <path>
```

The first argument after the script must be `score-snapshot`. `--input` may
appear anywhere after it; the first `--input` that is followed by a value
wins, and other arguments are ignored.

### Input

The file must contain one JSON object. Each key is optional:

| Key | Signal |
| --- | --- |
| `dependents` | Current dependents. |
| `recent_dependents` | Current recent dependents. |
| `downloads` | Current downloads. |
| `days_since_release` | Days since the latest release, now. |
| `historical_dependents` | Dependents 30 days ago. |
| `historical_recent_dependents` | Recent dependents 30 days ago. |
| `historical_downloads` | Downloads 30 days ago. |
| `historical_days_since_release` | Days since the latest release, 30 days ago. |

A value is used when it is a JSON number; it is converted to `Int` by
truncation toward zero (`12.9` becomes `12`), and values beyond the `Int`
range saturate at its bounds. A missing key, a value of any
other JSON type (including a numeric string such as `"20"`) and a top-level
value that is not an object all count as `0`. The score functions then clamp
negative values to `0`. Unknown keys are ignored.

```json
{
  "dependents": 20,
  "recent_dependents": 4,
  "downloads": 300,
  "days_since_release": 40,
  "historical_dependents": 10,
  "historical_recent_dependents": 2,
  "historical_downloads": 0,
  "historical_days_since_release": 10
}
```

### Output

On success the command prints one line, the JSON form of the
[`ScoreSnapshot`](score.md#scoresnapshot), and exits with status `0`. Fields
appear in declaration order. A `NaN` field, which only arises from a count of
`2147483647` or more, is written as the string `"NaN"`. For the input above
the output is:

```json
{"score":301.7852882193072,"score_30d_ago":135.2764584196223,"score_growth_30d":166.5088297996849,"score_growth_ratio_30d":1.2308780976744749,"rank_label":"S","momentum_label":"Rising","activity_multiplier":1.06}
```

### Errors

Usage and parse errors print one JSON object with an `error` key to standard
output and exit with status `1`:

| Situation | Output |
| --- | --- |
| No arguments, or the first argument is not `score-snapshot` | `{"error":"Usage: score-snapshot --input <path>"}` |
| No `--input` followed by a value | `{"error":"Missing --input <path>"}` |
| The file is not valid JSON | `{"error":"Failed to parse JSON input"}` |

A file that cannot be read is not reported this way: Node.js raises an
uncaught `ENOENT` (or similar) error, prints a stack trace to standard error
and exits with status `1`. Callers should treat any non-zero status as a
failure and parse standard output only on status `0`.
