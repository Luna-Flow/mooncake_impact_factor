# cli design

The `cli` package is a bridge: it lets the Python index builder and other
non-MoonBit programs evaluate the MoonBit score rules. This page explains the
shape of that bridge. The score rules themselves are derived in the
[score design](score.md).

## Design goal

There must be exactly one implementation of the score, rank and momentum
rules, and the database the web application serves must be computed by it.
The index builder is written in Python because it works with SQLite, the file
system and HTTP; the rules are written in MoonBit so that MoonBit users can
call them as a library. The bridge has to connect the two without copying the
rules, with as little machinery as possible.

## Mathematical background

The command computes a function of eight integers,

$$
f : \mathbb{Z}^8 \to \mathbb{R}^5 \times \{\texttt{S}, \texttt{A}, \texttt{B}, \texttt{C}, \texttt{D}\} \times \{\texttt{Rising}, \texttt{Hot}, \texttt{Stable}\},
$$

namely `compute_score_snapshot`. Its input arrives as JSON, so the command
first applies a total decoding map $d$ from JSON values to $\mathbb{Z}^8$ and
prints $f(d(x))$. For each key $k$,

$$
d_k(x) =
\begin{cases}
\operatorname{sat}\bigl(\operatorname{trunc}(x_k)\bigr) & x \text{ is an object and } x_k \text{ is a number} \\
0 & \text{otherwise,}
\end{cases}
$$

where $\operatorname{trunc}$ rounds toward zero and $\operatorname{sat}$
clamps to $[-2^{31}, 2^{31} - 1]$. Because $d$ is total, the only failures
are the ones outside it: wrong arguments, an unreadable file and text that is
not JSON. Since the score clamps negative counts to $0$, the composite
$f \circ d$ maps every JSON value to a snapshot.

Two properties follow and are what callers rely on:

- **Determinism.** $f$ and $d$ are pure, so the same file always gives the
  same output, byte for byte: `Json::stringify` writes the fields in
  declaration order and, on the JavaScript target, prints each `Double` in
  its shortest round-trip form.
- **Agreement with the library.** For an input object with integer values
  in the `Int` range, $d$ is the identity on those values, so the command
  prints exactly `Json(@score.compute_score_snapshot(...))`.

## Design decisions

### A process per snapshot, through a file

**Problem.** Python must call MoonBit code.

**Options.** Re-implement the formula in Python; call MoonBit compiled to
WebAssembly from Python; run a long-lived MoonBit server; run a MoonBit
program per snapshot.

**Choice.** A JavaScript executable that Python starts once per package, with
the input in a temporary file. A Python copy of the formula would be a second
source of truth (an unused one still exists in `scripts/build_index.py`); a
WebAssembly host or a server would add a dependency or a protocol for a job
that runs once per index build. The file keeps the command line short and
lets the builder delete the input in a `finally` block.

The cost is one Node.js start per package. Starting a process takes tens of
milliseconds while the score takes microseconds, so the builder's scoring
phase is $\Theta(N)$ process starts for $N$ packages. For a registry of a few
thousand packages that is acceptable for an offline build.

### JavaScript only

The command reads files with `fs.readFileSync` and exits with
`process.exit`, both through `extern "js"` functions, so the package sets
`supported_targets = "js"`. The repository needs Node.js anyway for the web
application, so no other runtime is required.

### Lenient input, strict errors

**Problem.** A caller may not know every signal, for example the downloads
of a package that the builder could not look up.

**Choice.** Missing and non-numeric fields decode to `0`, the neutral
value of every signal. Malformed JSON and bad arguments, which point to a bug
in the caller rather than to missing data, produce an `error` object and exit
status `1`. The error objects are JSON so that a caller can parse standard
output in every case.

### Labels computed in MoonBit

The command returns labels, not only numbers. If the builder computed
`rank_label` itself from the stored score, a change of thresholds in MoonBit
would silently not reach the database. Returning the whole snapshot keeps the
labels and the numbers from one evaluation, so the
[snapshot consistency](score.md#snapshot-consistency) invariant holds in the
database too.

## Correctness / invariants

- Exit status `0` implies that standard output is one line containing a JSON
  object with the seven `ScoreSnapshot` fields.
- Exit status `1` with a JSON object on standard output implies an `error`
  key. An unreadable input file also exits with `1` but writes only to
  standard error.
- The output does not depend on the current time, the environment or any
  file other than the input: all time-dependent signals are computed by the
  caller.

## Alternatives rejected

- **Reading standard input.** It would avoid the temporary file, but
  `readFileSync` on a path works the same on every platform Node.js supports,
  and the file can be inspected when a build goes wrong.
- **A batch mode** that scores many packages per process would remove the
  per-package start-up cost. It is not implemented; the per-package contract
  is simpler and fast enough for the current registry size.
- **Command-line flags for each signal** (`--dependents 20`) would make the
  call longer and need a parser; JSON matches the dictionary the builder
  already has.

## Boundaries

- The command evaluates one snapshot. It does not read the registry, query
  SQLite, fetch downloads or compute dates.
- It does not validate that the signals are consistent with each other.
- It reports unreadable files through Node.js, not as JSON.
- It runs only on the JavaScript target with Node.js.
