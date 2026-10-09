# cli API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/cli` is an executable for the
JavaScript target. Its one command, `build-index`, reads an
[`@metrics.Input`](metrics.md#input) from a JSON file, runs
[`@metrics.compute`](metrics.md#compute) and writes the
[`@metrics.Report`](metrics.md#report) as JSON. It exists so that programs
outside MoonBit, above all the Python index builder
[`scripts/build_index.py`](../../../scripts/build_index.py), use the MoonBit
counting and scoring rules instead of copying them. The index builder runs
the command once for the whole registry.

Source: [`src/cli/main.mbt`](../../../src/cli/main.mbt). Its interface file is
empty: the package exports no MoonBit names, and its interface is the
command line described here. The reasons for this shape are in the
[cli design](../design/cli.md).

## Building

The package cannot be imported. It declares `supported_targets = "js"` and
`pkgtype(kind: "executable")`. Build it from the repository root:

```bash
moon build src/cli --target js --release
```

The result is `_build/js/release/build/cli/cli.js`; without `--release` it
is `_build/js/debug/build/cli/cli.js`, with the same behaviour. The index
builder runs this build before every use. The script reads and writes files
through `process.getBuiltinModule("fs")` and therefore needs Node.js 20.16,
22.3 or later.

During development, `moon run` builds and runs in one step:

```bash
moon run src/cli --target js -- build-index --input input.json
```

## `build-index`

`build-index` computes the report of a registry snapshot.

```text
node cli.js build-index --input <path> [--output <path>]
```

The first argument after the script must be `build-index`. `--input` is
required and `--output` optional; both may appear in any order after the
command. For each option the first occurrence that is followed by another
argument wins, whatever that argument is. Other arguments are ignored.

| Option | Meaning |
| --- | --- |
| `--input <path>` | JSON file holding one `@metrics.Input`. Relative paths are relative to the working directory. |
| `--output <path>` | File to write the report to. The file is created or replaced; its directory must exist. Without this option the report goes to standard output. |

### Input

The input file holds one JSON object in the [JSON form](metrics.md#json-form)
of `@metrics.Input`:

```json
{
  "now": "2026-10-01T00:00:00Z",
  "releases": [
    {"name": "alice/json", "version": "0.2.0", "created_at": "2026-09-10T08:00:00Z", "deps": [], "yanked": false},
    {"name": "alice/http", "version": "1.0.0", "created_at": "2026-06-01T12:00:00Z", "deps": ["alice/json"], "yanked": false},
    {"name": "bob/web", "version": "0.3.0", "deps": ["alice/http", "alice/json"], "yanked": false}
  ],
  "downloads": {"alice/json": 1200, "alice/http": 300},
  "download_history": [
    {"taken_at": "2026-09-02T00:00:00Z", "counts": {"alice/json": 900, "alice/http": 280}}
  ]
}
```

| Key | Content |
| --- | --- |
| `now` | RFC 3339 timestamp to measure at. |
| `releases` | Every release: `name`, `version`, `deps` (array of package names) and `yanked` are required; `created_at` is an RFC 3339 string or absent. |
| `downloads` | Object from package names to current download counts. |
| `download_history` | Array of `{"taken_at": ..., "counts": {...}}` snapshots; may be empty. |

All four top-level keys are required. An unknown date is an absent
`created_at` key: `null` is rejected. Unknown keys are ignored, so index
records can carry extra fields. A fractional count is truncated, a negative
count counts as `0`, and a count outside the 32-bit integer range is an
error. The meaning of every field and the rules of the computation are in
the [metrics API](metrics.md#compute).

### Output

On success the command writes the report as one line of JSON and exits with
status `0`. With `--output` it writes the line, without a final newline, to
the file and prints nothing; without it, it prints the line and a newline to
standard output.

The report is the JSON form of `@metrics.Report`, with keys in declaration
order:

| Key | Content |
| --- | --- |
| `computed_at` | `now` in UTC with milliseconds, such as `2026-10-01T00:00:00.000Z`. |
| `population` | Number of packages. |
| `download_history_used` | Whether a download snapshot stood for 30 days ago. |
| `rank_counts`, `momentum_counts` | Objects from labels to package counts; labels without packages are absent. |
| `top_score` | The best score, `0` for an empty registry. |
| `packages` | Array of [`PackageReport`](metrics.md#packagereport) objects, ordered by name. |
| `edges` | Array of [`Edge`](metrics.md#edge) objects. |

Each package object contains `signals` and, when the package had a release
30 days ago, `signals_30d_ago`, both in the form of
[`@score.Signals`](score.md#signals), and `snapshot`, the
[`@score.ScoreSnapshot`](score.md#scoresnapshot) with its nested
`breakdown`. Keys whose value is `None` are absent: `latest_version`,
`latest_created_at`, `downloads_30d_ago` and `signals_30d_ago` in a package,
and `first_seen_at` in an edge. Numbers are finite; a `Double` with an
integral value is written without a fraction, as `0` or `1`.

For the input above the command prints the following report, shown here
indented with `jq` and with the package `alice/http` and the last edge left
out:

```json
{
  "computed_at": "2026-10-01T00:00:00.000Z",
  "population": 3,
  "download_history_used": true,
  "rank_counts": {
    "B": 1,
    "S": 1,
    "D": 1
  },
  "momentum_counts": {
    "Stable": 2,
    "New": 1
  },
  "top_score": 215.98106900995947,
  "packages": [
    {
      "name": "alice/json",
      "owner": "alice",
      "package_name": "json",
      "latest_version": "0.2.0",
      "latest_created_at": "2026-09-10T08:00:00Z",
      "version_count": 1,
      "versions": [
        "0.2.0"
      ],
      "dependents": 2,
      "external_dependents": 1,
      "self_dependents": 1,
      "recent_dependents": 1,
      "dependent_owners": 1,
      "downloads": 1200,
      "downloads_30d_ago": 900,
      "days_since_release": 20,
      "signals": {
        "external_dependents": 1,
        "self_dependents": 1,
        "recent_external_dependents": 0,
        "recent_self_dependents": 1,
        "downloads": 1200,
        "days_since_release": 20
      },
      "snapshot": {
        "score": 215.98106900995947,
        "score_30d_ago": 0,
        "score_growth_30d": 215.98106900995947,
        "score_growth_ratio_30d": 1,
        "rank_label": "S",
        "rank_position": 1,
        "momentum_label": "New",
        "activity_multiplier": 1.12,
        "breakdown": {
          "dependents": 30.815348216220492,
          "recent_dependents": 6.024875885483664,
          "downloads": 156.00001608575963,
          "multiplier": 1.12
        }
      }
    },
    {
      "name": "bob/web",
      "owner": "bob",
      "package_name": "web",
      "latest_version": "0.3.0",
      "version_count": 1,
      "versions": [
        "0.3.0"
      ],
      "dependents": 0,
      "external_dependents": 0,
      "self_dependents": 0,
      "recent_dependents": 0,
      "dependent_owners": 0,
      "downloads": 0,
      "days_since_release": 3650,
      "signals": {
        "external_dependents": 0,
        "self_dependents": 0,
        "recent_external_dependents": 0,
        "recent_self_dependents": 0,
        "downloads": 0,
        "days_since_release": 3650
      },
      "signals_30d_ago": {
        "external_dependents": 0,
        "self_dependents": 0,
        "recent_external_dependents": 0,
        "recent_self_dependents": 0,
        "downloads": 0,
        "days_since_release": 3650
      },
      "snapshot": {
        "score": 0,
        "score_30d_ago": 0,
        "score_growth_30d": 0,
        "score_growth_ratio_30d": 0,
        "rank_label": "D",
        "rank_position": 3,
        "momentum_label": "Stable",
        "activity_multiplier": 0.88,
        "breakdown": {
          "dependents": 0,
          "recent_dependents": 0,
          "downloads": 0,
          "multiplier": 0.88
        }
      }
    }
  ],
  "edges": [
    {
      "source": "alice/http",
      "target": "alice/json",
      "first_seen_at": "2026-06-01T12:00:00.000Z",
      "same_owner": true
    },
    {
      "source": "bob/web",
      "target": "alice/http",
      "same_owner": false
    }
  ]
}
```

`bob/web` has no `created_at`, so its age is
`@score.UNKNOWN_RELEASE_AGE_DAYS` and its edges have no `first_seen_at`;
such a dependent is never recent. `alice/json` had no release 30 days
earlier, so it has no `signals_30d_ago` and is `New`. `bob/web` has no
`downloads_30d_ago` because it is missing from the download snapshot.

### Errors

Usage, parse, decoding and input errors print one JSON object with an
`error` key to standard output and exit with status `1`. Nothing is written
to the output file.

| Situation | Output |
| --- | --- |
| No arguments, or the first argument is not `build-index` | `{"error":"Usage: cli build-index --input <path> [--output <path>]"}` |
| No `--input` followed by a value | the same usage message |
| The input file is not valid JSON | the parser's message, such as `{"error":"Invalid character 'o' at line 1, column 1"}` |
| The JSON does not decode as `@metrics.Input` | the decoder's message with the JSON path, such as `{"error":"JsonDecodeError((/releases/0, Missing field yanked))"}` |
| `now` is not an RFC 3339 timestamp | `{"error":"invalid timestamp for now: <now>"}` |

The texts of the parser and decoder messages come from
`moonbitlang/core/json` and may change with the compiler; match on the
`error` key, not on the text.

A file that cannot be read or written is not reported this way: Node.js
raises an uncaught `ENOENT` (or similar) error, prints a stack trace to
standard error and exits with status `1`. Callers should treat any non-zero
status as a failure and use the report only on status `0`, as the index
builder does.
