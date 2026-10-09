# MOONCAKE IMPACT FACTOR

[![img](https://img.shields.io/badge/Maintainer-KCN--judu-violet)](https://github.com/KCN-judu) [![img](https://img.shields.io/badge/License-Apache%202.0-blue)](https://github.com/Luna-Flow/mooncake_impact_factor/blob/main/LICENSE) ![img](https://img.shields.io/badge/State-active-success)

`mooncake_impact_factor` ranks the packages of the MoonBit registry by how
much the ecosystem relies on them, the way a journal impact factor measures
how often a journal is cited. It counts the packages whose latest release
depends on each package (those of the same owner at a quarter), the recent
ones among them, downloads and release age; it places every package by
position, grade (`S` to `D`, shares of the registry) and 30-day momentum
(`New`, `Rising`, `Stable`, `Cooling`), and serves the rankings at
<https://impact-factor.lunaflow.cn>, rebuilt every day. The rules are a
MoonBit library, so the same numbers can be computed in any MoonBit program,
with the same bits on every backend.

This README describes version `0.2.0`.

## Install

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

Import the package you need in `moon.pkg`:

```text
import {
  "Luna-Flow/mooncake-impact-factor/score",
}
```

## Example

```moonbit
test "score a registry" {
  // 20 dependents of other owners (4 of them recent), 3 of the same owner,
  // 300 downloads, released 40 days ago; and a package without any signal.
  let busy : @score.Signals = {
    external_dependents: 20,
    self_dependents: 3,
    recent_external_dependents: 4,
    recent_self_dependents: 0,
    downloads: 300,
    days_since_release: 40,
  }
  let idle : @score.Signals = {
    ..busy,
    external_dependents: 0,
    self_dependents: 0,
    recent_external_dependents: 0,
    downloads: 0,
  }
  let snapshots = @score.score_population([busy, idle][:], [Some(busy), None][:])
  inspect(snapshots[0].rank_label, content="S")
  inspect(snapshots[0].momentum_label, content="Stable")
  inspect(snapshots[1].momentum_label, content="New")
}
```

The score is
$m(t)\bigl(38\ln(1+D) + 27\ln(1+R) + 22\ln(1+W)\bigr)$ for $D$
dependents, $R$ recent dependents (both counting those of the same owner at
$1/4$), $W$ downloads and a release-recency multiplier $m(t)$ falling from
$1.12$ at 30 days to $0.88$ at one year.

## Packages

| Package | Purpose |
| --- | --- |
| `score` | Impact score and its breakdown, rank positions, grades, momentum labels, scored populations. |
| `metrics` | Registry signals: latest releases, current dependents, recent dependents, the signals of 30 days ago, and the scores of the whole registry. |
| `cli` | JavaScript command `build-index` that runs `metrics` on a registry file; used by the Python index builder. |
| `query` | Search query language: query tree, expression parser and serializer, flat parameters, labels, sort keys, paging. |
| `query_sql` | Compiles search requests to SQLite statements for the dynamic site. |
| `static_search` | Search engine of the static site: evaluation, relevance, sorting, paging. |

Outside MoonBit, `scripts/build_index.py` moves the registry index and the
download counts into the MoonBit computation and its report into SQLite,
`scripts/export_static_json.py` exports the database for the static site,
and `app/`, `frontend/src/` and `lib/` hold the Next.js application. Its
look and its localisation follow the
[Luna-Flow documentation site](https://lunaflow.cn): the same tokens and page
chrome, pages under `/en/`, `/zh-cn/` and `/ja/`, and interface strings
translated through gettext catalogs in `web/i18n`.

## Run the application

```bash
moon update                        # refresh ~/.moon/registry/index/user
python3 scripts/build_index.py --db data/mooncake.db --refresh-downloads
npm install
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

Use `--skip-mooncakes-downloads` to build offline from the cached counts,
or `--downloads-json <file>` to override download counts. `just dev` runs
the whole sequence. For the static site, run `npm run build:static-data`,
`npm run build:static` and `npm run serve:static`.

The rankings come from the registry index and the download counts of
mooncakes.io; they measure reliance, not quality, and are not an
authoritative ranking of the ecosystem.

## Toolchain

- MoonBit with `moonc` 0.10 or later (`moon.mod` / `moon.pkg` manifests).
- Node.js 20.16, 22.3 or later, and npm.
- Python 3.

## Documentation

The manual is published at <https://lunaflow.cn/en/mooncake_impact_factor/>
with Chinese and Japanese translations. Its English source is
[`doc/manual/index.md`](doc/manual/index.md): API references, tutorials and
design notes for every package, a getting-started guide and an architecture
guide. The [score design](doc/manual/design/score.md) derives the formula,
the grades and the momentum rules, the
[metrics design](doc/manual/design/metrics.md) defines the signals, and the
[static_search design](doc/manual/design/static_search.md) the browser
ranking and how it differs from the server. Changes between versions are
listed in [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, the checks to run
before a pull request and the release procedure.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
