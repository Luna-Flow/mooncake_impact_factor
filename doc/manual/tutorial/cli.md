# cli tutorial

This tutorial shows you how to measure a registry from outside MoonBit with
the `build-index` command: write the release records of a few packages to a
JSON file, run the command, and read the report with `jq` and from Python, as
the index builder does. You need a checkout of this repository, the MoonBit
toolchain, Node.js 20.16, 22.3 or later, and `jq` for the shell examples. Run
every command from the repository root.

| I want to | Use |
| --- | --- |
| build the command | `moon build src/cli --target js --release` |
| measure a registry | `node _build/js/release/build/cli/cli.js build-index --input <file> --output <file>` |
| list the ranking | `jq` over `.packages[].snapshot` |
| explain one score | `.signals`, `.signals_30d_ago` and `.snapshot.breakdown` of the package |
| list the dependents of a package | `.edges[]` with that `target` |
| call it from another language | write the input file, run the command, check the exit status, read the output file |

## Quick start

Build the executable:

```bash
moon build src/cli --target js --release
```

Write the releases of four packages, their current download counts and one
download snapshot from about 30 days ago to `input.json`:

```bash
cat > input.json <<'JSON'
{
  "now": "2026-10-01T00:00:00Z",
  "releases": [
    {"name": "alice/json", "version": "0.1.0", "created_at": "2025-11-02T08:00:00Z", "deps": [], "yanked": false},
    {"name": "alice/json", "version": "0.2.0", "created_at": "2026-09-10T08:00:00Z", "deps": [], "yanked": false},
    {"name": "alice/http", "version": "1.0.0", "created_at": "2026-06-01T12:00:00Z", "deps": ["alice/json"], "yanked": false},
    {"name": "bob/web", "version": "0.3.0", "created_at": "2026-09-25T09:30:00Z", "deps": ["alice/http", "alice/json"], "yanked": false},
    {"name": "carol/cli", "version": "1.0.0", "created_at": "2025-03-01T00:00:00Z", "deps": ["alice/json"], "yanked": false}
  ],
  "downloads": {"alice/json": 1200, "alice/http": 300, "bob/web": 40, "carol/cli": 15},
  "download_history": [
    {"taken_at": "2026-09-02T00:00:00Z", "counts": {"alice/json": 900, "alice/http": 280, "carol/cli": 15}}
  ]
}
JSON
```

Run the command and look at the summary of the report:

```bash
CLI=_build/js/release/build/cli/cli.js
node $CLI build-index --input input.json --output report.json
jq '{computed_at, population, download_history_used, top_score, rank_counts, momentum_counts}' report.json
```

```json
{
  "computed_at": "2026-10-01T00:00:00.000Z",
  "population": 4,
  "download_history_used": true,
  "top_score": 249.40610439873305,
  "rank_counts": {
    "B": 1,
    "S": 1,
    "C": 1,
    "D": 1
  },
  "momentum_counts": {
    "Rising": 2,
    "New": 1,
    "Stable": 1
  }
}
```

The download snapshot of 2 September lies within 7 days of 1 September, 30
days before `now`, so `download_history_used` is `true`. Without
`--output`, the command prints the same report on one line to standard
output.

## Everyday tasks

The examples below read the `report.json` of the quick start.

### List the ranking

Every package carries its score snapshot. Sort by `rank_position` to get the
ranking:

```bash
jq -r '.packages | sort_by(.snapshot.rank_position)[]
  | [.snapshot.rank_position, .snapshot.rank_label, .name,
     (.snapshot.score | floor), .snapshot.momentum_label] | @tsv' report.json
```

```text
1	S	alice/json	249	Rising
2	B	alice/http	179	Rising
3	C	bob/web	91	New
4	D	carol/cli	53	Stable
```

The labels are shares of the population: with four packages each position is
25 % of it, so position 2 is already `B`. The
[score tutorial](score.md#rank-a-population) shows the rule in MoonBit.

### Explain one score

`signals` holds what was measured now, `signals_30d_ago` what was measured
30 days earlier, and `snapshot.breakdown` the three terms of the score and
the release multiplier:

```bash
jq '.packages[] | select(.name == "alice/json")
  | {signals, signals_30d_ago, breakdown: .snapshot.breakdown}' report.json
```

```json
{
  "signals": {
    "external_dependents": 2,
    "self_dependents": 1,
    "recent_external_dependents": 1,
    "recent_self_dependents": 1,
    "downloads": 1200,
    "days_since_release": 20
  },
  "signals_30d_ago": {
    "external_dependents": 1,
    "self_dependents": 1,
    "recent_external_dependents": 0,
    "recent_self_dependents": 1,
    "downloads": 900,
    "days_since_release": 302
  },
  "breakdown": {
    "dependents": 44.78888986098256,
    "recent_dependents": 21.895115837840876,
    "downloads": 156.00001608575963,
    "multiplier": 1.12
  }
}
```

Thirty days ago `bob/web` did not exist yet, so `alice/json` had one external
dependent fewer; its downloads came from the snapshot; and its latest release
was 0.1.0, 302 days old. The score is
$(44.79 + 21.90 + 156.00) \times 1.12 \approx 249.4$.

### List the dependents of a package

`edges` holds every current dependency once, with the date it first
appeared:

```bash
jq -r '.edges[] | select(.target == "alice/json")
  | "\(.source)\t\(if .same_owner then "same owner" else "external" end)\t\(.first_seen_at // "unknown")"' report.json
```

```text
alice/http	same owner	2026-06-01T12:00:00.000Z
bob/web	external	2026-09-25T09:30:00.000Z
carol/cli	external	2025-03-01T00:00:00.000Z
```

`carol/cli` added the dependency more than 180 days ago, so it is not one of
the recent dependents. `alice/http` has the same owner and counts a quarter
in the score.

### Follow the 30-day change

`score_30d_ago` and `momentum_label` show how each package moved:

```bash
jq -r '.packages[] | "\(.name)\t\(.snapshot.score_30d_ago | floor) -> \(.snapshot.score | floor)\t\(.snapshot.momentum_label)"' report.json
```

```text
alice/http	133 -> 179	Rising
alice/json	172 -> 249	Rising
bob/web	0 -> 91	New
carol/cli	53 -> 53	Stable
```

A key whose value is unknown is absent from the report, and `jq` reads an
absent key as `null`. `bob/web` had no release 30 days ago, so it has no
`signals_30d_ago`, and it is missing from the download snapshot, so it has no
`downloads_30d_ago`:

```bash
jq -r '.packages[] | select(has("signals_30d_ago") | not) | .name' report.json
```

```text
bob/web
```

### Call it from Python

The index builder writes the input to a temporary file, runs the command
with `--output` and reads the report back. A minimal version:

```python
import json
import subprocess
import tempfile
from pathlib import Path

CLI = Path("_build/js/release/build/cli/cli.js")


def build_index(payload: dict) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.json"
        output_path = Path(tmp) / "report.json"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        done = subprocess.run(
            ["node", str(CLI), "build-index",
             "--input", str(input_path), "--output", str(output_path)],
            capture_output=True, text=True,
        )
        if done.returncode != 0:
            raise RuntimeError(f"build-index failed: {done.stdout}{done.stderr}")
        return json.loads(output_path.read_text(encoding="utf-8"))


def release(name, version, created_at=None, deps=(), yanked=False):
    record = {"name": name, "version": version, "deps": list(deps), "yanked": yanked}
    if created_at is not None:  # an unknown date is an absent key, not null
        record["created_at"] = created_at
    return record


report = build_index({
    "now": "2026-10-01T00:00:00Z",
    "releases": [
        release("alice/json", "0.2.0", "2026-09-10T08:00:00Z"),
        release("bob/web", "0.3.0", deps=["alice/json"]),
    ],
    "downloads": {"alice/json": 1200},
    "download_history": [],
})
for package in report["packages"]:
    snapshot = package["snapshot"]
    print(package["name"], snapshot["rank_label"], round(snapshot["score"], 2))
```

```text
alice/json S 204.22
bob/web D 0
```

`bob/web` has no release date and no downloads; its dependency on
`alice/json` still counts, but not as recent, because its date is unknown.
Reading the report from a file rather than from standard output keeps a
large report out of the pipe, and the exit status tells success from
failure.

### Handle errors

Errors print a JSON object with an `error` key and exit with status `1`. A
date without a time and a zone is not RFC 3339:

```bash
echo '{"now": "2026-10-01", "releases": [], "downloads": {}, "download_history": []}' > bad-now.json
node $CLI build-index --input bad-now.json; echo "status $?"
```

```text
{"error":"invalid timestamp for now: 2026-10-01"}
status 1
```

An unknown release date written as `null` instead of an absent key:

```bash
cat > null-date.json <<'JSON'
{"now": "2026-10-01T00:00:00Z",
 "releases": [{"name": "a/lib", "version": "1.0.0", "created_at": null, "deps": [], "yanked": false}],
 "downloads": {}, "download_history": []}
JSON
node $CLI build-index --input null-date.json; echo "status $?"
```

```text
{"error":"JsonDecodeError((/releases/0/created_at, String::from_json: expected string))"}
status 1
```

Check the exit status before you use the output. A missing input file also
exits with status `1`, but Node.js prints a stack trace to standard error
instead of JSON.

## Going further

- **Measure the real registry.** `python3 scripts/build_index.py` reads the
  local registry index under `~/.moon/registry/index/user`, fetches the
  download counts, keeps a 45-day download history in
  `data/download_history.json`, runs `build-index` once and writes the report
  to the SQLite database of the web application. `--now` fixes the point in
  time; the [architecture guide](../architecture.md) describes the whole
  pipeline.
- **Work in MoonBit instead.** Inside a MoonBit program, call
  `@metrics.compute` directly, as in the [metrics tutorial](metrics.md); the
  command adds only file reading and JSON.
- **Exact rules.** The [metrics API](../api/metrics.md#compute) lists every
  counting rule; the [cli API](../api/cli.md) lists the input and output
  contract.

## Common pitfalls

- **`null` for unknown values.** Leave the key out. Only `created_at` is
  optional in the input; every other key is required.
- **Wrong argument order.** `build-index` must be the first argument after
  the script; `--input input.json build-index` prints the usage error.
- **Stale build.** Rebuild after you change `src/score` or `src/metrics`, or
  the report follows the old rules. The index builder rebuilds before every
  run; a hand-run `node` command does not.
- **Reading standard output with `--output`.** With `--output` the command
  prints nothing on success; read the file.
- **Comparing reports from different inputs.** Ranks are shares of the
  population in the input. A report built from a few packages ranks them
  among themselves, not against the registry.

## Next steps

- [cli API](../api/cli.md) for the exact input, output and error contract.
- [cli design](../design/cli.md) for why the bridge is a file-based command.
- [metrics API](../api/metrics.md) for the meaning of every report field.
- [score API](../api/score.md) for the score, the ranks and the momentum
  labels.
