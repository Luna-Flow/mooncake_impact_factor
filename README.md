# MOONCAKE IMPACT FACTOR

[![img](https://img.shields.io/badge/Maintainer-KCN--judu-violet)](https://github.com/KCN-judu) [![img](https://img.shields.io/badge/License-Apache%202.0-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE) ![img](https://img.shields.io/badge/State-active-success)

`mooncake_impact_factor` ranks the packages of the MoonBit registry by how
much the ecosystem relies on them. It scores each package from its
dependents, recent dependents, downloads and release date, and serves the
rankings in a searchable web application that runs locally against SQLite or
as a static site. The score rules are a MoonBit library, so the same numbers
can be computed in any MoonBit program.

This README describes version `0.1.2`.

## Install

```bash
moon add Luna-Flow/mooncake-impact-factor@0.1.2
```

Import the package you need in `moon.pkg`:

```text
import {
  "Luna-Flow/mooncake-impact-factor/score",
}
```

## Example

```moonbit
test "score a package" {
  // 20 dependents, 4 of them recent, 300 downloads, released 40 days ago
  let score = @score.compute_score(20, 4, 300, 40)
  inspect(@score.rank_label(score), content="S")
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  inspect(snapshot.momentum_label, content="Rising")
}
```

The score is
$\bigl(38\ln(1+D) + 27\ln(1+R) + 22\ln(1+W)\bigr)\cdot m(t)$ for $D$
dependents, $R$ recent dependents, $W$ downloads and a release-recency
multiplier $m(t)$ between $0.88$ and $1.12$.

## Packages

| Package | Purpose |
| --- | --- |
| `score` | Impact score, rank labels (`S` to `D`), momentum labels (`Rising`, `Hot`, `Stable`) and score snapshots. |
| `cli` | JavaScript command `score-snapshot` that scores one package from a JSON file; used by the Python index builder. |
| `static_search` | Version tag and text normalisation for the browser search of the static site (JavaScript only). |

Outside MoonBit, `scripts/build_index.py` builds the SQLite database from the
local registry index, `scripts/export_static_json.py` exports it for the
static site, and `app/`, `frontend/src/` and `lib/` hold the Next.js
application.

## Run the application

```bash
moon update                        # refresh ~/.moon/registry/index/user
moon build src/cli --target js
python3 scripts/build_index.py --db data/mooncake.db
npm install
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

Add `--skip-mooncakes-downloads` to build offline, or
`--downloads-json <file>` to override download counts. `just dev` runs the
whole sequence. For the static site, run `npm run build:static-data`,
`npm run build:static` and `npm run serve:static`.

The rankings come from your local registry snapshot plus optional download
counts from mooncakes.io; they are not an authoritative ranking of the
ecosystem.

## Toolchain

- MoonBit with `moonc` 0.10 or later (`moon.mod` / `moon.pkg` manifests).
- Node.js 20.16, 22.3 or later, and npm.
- Python 3.

## Documentation

The manual is published at <https://lunaflow.cn/en/mooncake_impact_factor/>
with Chinese and Japanese translations. Its English source is
[`doc/manual/index.md`](doc/manual/index.md): API references, tutorials and
design notes for every package, a getting-started guide and an architecture
guide. Changes between versions are listed in [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, the checks to run
before a pull request and the release procedure.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
