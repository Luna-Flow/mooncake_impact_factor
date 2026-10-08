# static_search tutorial

This tutorial shows you how to use the MoonBit `static_search` package to
normalise text the way the static site's search does, how to build and serve
the static site with its search index, and how to write queries for it. The
[static_search design](../design/static_search.md) explains the index and the
ranking in detail.

| I want to | Use |
| --- | --- |
| lower-case text like the static search | `@static_search.normalize_text(text)` |
| tell which static search runtime is loaded | `@static_search.runtime_version()` |
| build and serve the static site | `npm run build:static-data`, `npm run build:static`, `npm run serve:static` |
| find packages | the native expression language, for example `json AND score>=180` |
| predict the order of results | the coordination count, then score, then name |

## Quick start

Add the module to your project:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.1.2
```

The package builds only for the JavaScript target, so the package that
imports it must do so as well:

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/static_search",
}

supported_targets = "js"
```

Case-insensitive matching is a substring test on lower-cased text:

```moonbit
test "quick start" {
  let needle = @static_search.normalize_text("JSON")
  let text = @static_search.normalize_text("moonbit-community/json5 JSON5 parser")
  inspect(text.contains(needle), content="true")
}
```

Run it with `moon test --target js`.

## Everyday tasks

### Normalise a search box value

The search worker trims the query value and lower-cases it. `normalize_text`
only lower-cases, so trim first:

```moonbit
test "normalise a needle" {
  let raw = "  Http Client "
  let needle = @static_search.normalize_text(raw.trim().to_owned())
  inspect(needle, content="http client")
}
```

### Build and serve the static site

From the repository root, build the database, export the static data and
build the site:

```bash
npm install
npm run build:static-data   # builds cli and static_search, the database and public/data
npm run build:static        # compiles static_search again, then runs next build into out/
npm run serve:static        # serves out/ on http://localhost:4173
```

`build:static-data` needs the local registry index under
`~/.moon/registry/index/user` (run `moon update` first) and fetches download
counts from mooncakes.io unless a cache exists. The search index is
`public/data/search/search-index.json`; the browser loads it once into a Web
Worker.

### Write queries

The search box accepts the native expression language. Terms are joined with
explicit `AND`, `OR` and `NOT`, grouped with parentheses:

| Query | Finds |
| --- | --- |
| `json` | Packages whose name, owner, description or keywords contain `json`. |
| `"http client"` | The exact substring `http client`, space included. |
| `owner:moonbitlang AND keyword:json` | Packages of that owner with a keyword containing `json`. |
| `json AND score>=180` | Packages mentioning `json` with a score of at least 180. |
| `(yaml OR toml) AND NOT rank=D` | YAML or TOML packages outside rank `D`. |
| `momentum=Rising AND recent_dependents>=5` | Fast-growing packages with at least five recent dependents. |

Fields are `text`, `owner`, `package`, `keyword`, `description`, `license`,
`repository`, `rank`, `momentum`, `score`, `dependents`,
`recent_dependents`, `downloads`, `year`, `has_repository` and `has_license`.
Operators are `:` (contains), `=`, `>=` and `<=`. There is no `>` or `<`.

### Understand the order of results

Without an explicit sort, the static site orders results by how many terms of
the query a package matches, then by score, then by name. The following
MoonBit program reproduces this for an `OR` of words:

```moonbit
priv struct Record {
  name : String
  text : String
  score : Double
}

fn record(name : String, description : String, score : Double) -> Record {
  { name, text: @static_search.normalize_text("\{name} \{description}"), score }
}

fn coverage(r : Record, words : Array[String]) -> Int {
  let mut n = 0
  for w in words {
    if r.text.contains(@static_search.normalize_text(w)) {
      n += 1
    }
  }
  n
}

test "coordination ranking" {
  let records = [
    record("alice/json", "Fast JSON parser", 120.0),
    record("bob/toml", "TOML parser", 300.0),
    record("carol/yaml", "YAML and JSON emitter", 80.0),
  ]
  let words = ["json", "parser"]
  let hits = records.filter(r => coverage(r, words) > 0)
  hits.sort_by((a, b) => {
    let by_rel = coverage(b, words).compare(coverage(a, words))
    if by_rel != 0 {
      return by_rel
    }
    let by_score = b.score.compare(a.score)
    if by_score != 0 { by_score } else { a.name.compare(b.name) }
  })
  inspect(
    hits.map(r => "\{r.name} \{coverage(r, words)}").join("\n"),
    content=(
      #|alice/json 2
      #|bob/toml 1
      #|carol/yaml 1
    ),
  )
}
```

The query `json OR parser` gives the same order on the static site:
`alice/json` matches both words, and the other two tie on one match and are
ordered by score. For `json AND parser` every result matches both words, so
the order is the plain score order.

## Going further

**Use the compiled module from JavaScript.** `moon build src/static_search
--target js` writes an ES module with `runtime_version` and
`normalize_text`; see the [static_search API](../api/static_search.md) for the
import path. Check `runtime_version()` when your JavaScript code depends on
the behaviour of a particular release.

**Compare with the dynamic site.** The local server
(`npm run dev`) runs the same query language against SQLite. Text terms there
match word prefixes through FTS5 instead of substrings, and results without
an explicit sort are ordered differently. The
[design page](../design/static_search.md#agreement-with-the-dynamic-site)
lists every difference.

**Publish to GitHub Pages.** The `deploy-static` workflow runs the same
commands on a schedule. Set `NEXT_PUBLIC_BASE_PATH` when the site is served
from a sub-path, so that the worker fetches `/<base>/data/...`.

## Common pitfalls

- **Implicit AND.** `json parser` without `AND` is a syntax error in the
  expression language. In the simple search field (`q`) the same text is one
  substring, `json parser`.
- **Trimming.** `normalize_text` keeps spaces. A needle with a trailing space
  matches less than the trimmed one.
- **Field operators.** `score:180` means `score = 180`, not at least 180. Use
  `score>=180`.
- **Labels are exact.** `rank=s` matches nothing on the static site; write
  `rank=S` and `momentum=Rising`.
- **`NOT` does not raise relevance.** Only positive terms count, so for
  `NOT rank=D OR json` every package that mentions `json` ranks above the
  rest, by score among themselves, whatever its rank.
- **Wrong target.** Importing `static_search` from a package that builds for
  `wasm-gc` or `native` fails, because the package uses JavaScript foreign
  functions.

## Next steps

- [static_search design](../design/static_search.md) for the index layout,
  the relevance count and the complexity of a query.
- [static_search API](../api/static_search.md) for the MoonBit and JavaScript
  functions.
- [score tutorial](score.md) for the numbers that the search filters and
  sorts.
- [architecture guide](../architecture.md) for the whole data pipeline.
