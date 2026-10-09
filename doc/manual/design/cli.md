# cli design

The `cli` package is a bridge: it lets the Python index builder run the
MoonBit computation of the [metrics](metrics.md) and [score](score.md)
packages on a whole registry. This page explains the shape of that bridge.

## Design goal

There must be exactly one implementation of every rule that changes a
score, and the database that the web application serves must be computed by
it. The index builder is written in Python because it works with SQLite, the
file system and HTTP; the rules are written in MoonBit so that MoonBit users
can call them as a library and so that they give the same result on every
backend. The bridge connects the two without copying a rule.

## Mathematical background

The command computes one function,

$$
\texttt{build-index} : \text{JSON} \to \text{JSON}, \qquad
x \mapsto \operatorname{Json}\bigl(\texttt{@metrics.compute}(d(x))\bigr),
$$

where $d$ is the JSON decoding of `@metrics.Input` derived by the
compiler. Unlike version 0.1, $d$ is strict: a missing required field, a
value of the wrong type or an invalid `now` is an error, because a silently
defaulted release would change every score of the registry.

- **Determinism.** `compute` is pure and processes packages in a fixed
  order, and `Json::stringify` writes fields in declaration order, so the
  same input file gives the same output byte for byte.
- **Agreement with the library.** The output is exactly
  `Json(@metrics.compute(input))`; nothing is recomputed outside MoonBit.

## Design decisions

### One process per build, through files

**Problem.** Version 0.1 started one Node.js process per package. A process
start costs tens of milliseconds while a score costs microseconds, so the
scoring phase was dominated by process starts, and relative grades need the
whole registry in one computation anyway.

**Choice.** One command reads the whole registry from an input file and
writes the report to an output file. For $2902$ packages and $17\,456$
releases the command takes about a second. Files rather than pipes keep the
input inspectable when a build goes wrong, and a report of several megabytes
is not limited by the size of standard output buffers.

### JavaScript only

The command reads and writes files and exits with a status through
`extern "js"` functions, so the package sets `supported_targets = "js"`.
The repository needs Node.js anyway for the web application.

### Errors as JSON

Bad arguments, input read failures, unreadable JSON and decoding errors print
one JSON object with an `error` key and exit with status `1`. The index
builder raises the message. Output write failures remain Node.js errors.

## Correctness / invariants

- Exit status `0` implies that the output file (or standard output without
  `--output`) holds one JSON object, the report.
- A handled usage, input read, parse or decoding failure exits with status `1`
  and an `error` object on standard output.
- The output depends only on the input file: the current time is the
  input's `now`.

## Alternatives rejected

- **Reading standard input**: a temporary file works the same on every
  platform and can be kept for debugging.
- **A long-lived server** or **WebAssembly from Python** would add a
  protocol or a dependency for a job that runs once a day.
- **Keeping `score-snapshot`** for single packages: a single score no
  longer has a grade or a position, so the command would answer a different
  question than the rankings do.

## Boundaries

- The command does not read the registry, fetch downloads or touch SQLite;
  `scripts/build_index.py` does.
- It runs only on the JavaScript target with Node.js.
