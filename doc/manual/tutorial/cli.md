# cli tutorial

This tutorial shows you how to compute score snapshots from outside MoonBit
with the `cli` executable: from a shell, from Python as the index builder
does, and from Node.js. You need a checkout of this repository, the MoonBit
toolchain and Node.js 20.16, 22.3 or later.

## Quick start

Build the executable from the repository root:

```bash
moon build src/cli --target js
```

Write the signals of one package to a file:

```bash
cat > payload.json <<'JSON'
{"dependents": 20, "recent_dependents": 4, "downloads": 300,
 "days_since_release": 40, "historical_dependents": 10,
 "historical_recent_dependents": 2, "historical_downloads": 0,
 "historical_days_since_release": 10}
JSON
node _build/js/debug/build/cli/cli.js score-snapshot --input payload.json
```

The command prints the snapshot on one line:

```text
{"score":301.7852882193072,"score_30d_ago":135.2764584196223,"score_growth_30d":166.5088297996849,"score_growth_ratio_30d":1.2308780976744749,"rank_label":"S","momentum_label":"Rising","activity_multiplier":1.06}
```

These are the same numbers as `@score.compute_score_snapshot(20, 4, 300, 40,
10, 2, 0, 10)` in MoonBit.

## Everyday tasks

### Leave out what you do not know

Every key is optional and defaults to `0`. A package released five days ago
with three dependents and nothing else known:

```bash
echo '{"dependents": 3, "days_since_release": 5}' > new.json
node _build/js/debug/build/cli/cli.js score-snapshot --input new.json
```

```text
{"score":59.00068800926255,"score_30d_ago":0,"score_growth_30d":59.00068800926255,"score_growth_ratio_30d":1,"rank_label":"C","momentum_label":"Stable","activity_multiplier":1.12}
```

The historical signals are all `0`, so `score_30d_ago` is `0` and the growth
ratio is reported as `1`.

### Call it from Python

The index builder runs the command once per package. A minimal version of its
helper:

```python
import json, os, subprocess, tempfile

CLI = "_build/js/debug/build/cli/cli.js"

def score_snapshot(signals: dict) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(signals, f)
        path = f.name
    try:
        done = subprocess.run(
            ["node", CLI, "score-snapshot", "--input", path],
            check=True, capture_output=True, text=True,
        )
    finally:
        os.unlink(path)
    return json.loads(done.stdout)

print(score_snapshot({"dependents": 20, "recent_dependents": 4,
                      "downloads": 300, "days_since_release": 40})["rank_label"])
```

```text
S
```

`check=True` turns every non-zero exit status into an exception, which covers
both the JSON error messages and a missing input file.

### Call it from Node.js

```js
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

writeFileSync("p.json", JSON.stringify({ dependents: 936, days_since_release: 120 }));
const out = execFileSync("node", [
  "_build/js/debug/build/cli/cli.js", "score-snapshot", "--input", "p.json",
]);
console.log(JSON.parse(out).rank_label);
```

```text
S
```

936 dependents alone are enough for rank `S` when the multiplier is $1$; the
[score design](../design/score.md#rank-thresholds-as-counts) derives why.

### Handle errors

Errors print a JSON object with an `error` key and exit with status `1`:

```bash
echo 'not json' > bad.json
node _build/js/debug/build/cli/cli.js score-snapshot --input bad.json; echo "status $?"
```

```text
{"error":"Failed to parse JSON input"}
status 1
```

Check the exit status before you parse the output. A missing file also exits
with `1` but prints a Node.js stack trace to standard error instead of JSON.

## Going further

- **Batch work.** Each call starts a Node.js process, which costs far more
  than the score itself. For many packages in one MoonBit program, call
  `@score.compute_score_snapshot` directly, as in the
  [score tutorial](score.md).
- **Where the signals come from.** The
  [architecture guide](../architecture.md) explains how the index builder
  counts dependents, recent dependents and historical values before it calls
  this command.
- **Strict inputs.** The command accepts sloppy input: strings and `null`
  become `0`, fractions are truncated. Validate the payload in the caller if
  a silent `0` would hide a bug.

## Common pitfalls

- **Numbers as strings.** `{"dependents": "20"}` scores as zero dependents.
  Write `20`, not `"20"`.
- **Wrong argument order.** `score-snapshot` must be the first argument after
  the script; `--input file.json score-snapshot` prints the usage error.
- **Stale build.** The index builder reuses an existing `cli.js`. Rebuild
  after you change `src/score`, or the database is scored with the old rules.
- **Large counts.** A count of `2147483647`, or any larger number (the
  conversion saturates at the largest `Int`), makes the score `NaN`. JSON has
  no `NaN`, so the output then contains the string `"NaN"` where a number is
  expected: `{"score":"NaN",...}`.

## Next steps

- [cli API](../api/cli.md) for the exact input, output and error contract.
- [cli design](../design/cli.md) for why the bridge is a file-based command.
- [score API](../api/score.md) for the meaning of every output field.
