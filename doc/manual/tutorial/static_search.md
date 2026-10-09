# static_search tutorial

This tutorial shows you how to build and serve the static site, how its
search answers queries, and how to run the same search engine from MoonBit
with the `static_search` package. The
[static_search design](../design/static_search.md) explains the index and
the ranking in detail.

| I want to | Use |
| --- | --- |
| build and serve the static site | `npm run build:static-data`, `npm run build:static`, `npm run serve:static` |
| find packages | the native expression language, for example `json AND score>=180` |
| predict the order of results | relevance (matched terms), then rank position, then name |
| search an index from MoonBit | `@static_search.parse_index`, `@static_search.search_items` |
| test one package against a query | `@static_search.evaluate`, `@static_search.relevance` |

## Quick start

Add the module and import the two packages:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
  "Luna-Flow/mooncake-impact-factor/static_search",
}
```

Search a small index:

```moonbit
test "quick start" {
  let index =
    #|{"items":[
    #| {"full_name":"alice/json","rank_label":"A","momentum_label":"Rising","score":200,
    #|  "score_growth_30d":5,"download_count":10,"dependent_count":3,"recent_dependent_count":1,
    #|  "external_dependent_count":2,"dependent_owner_count":2,"days_since_release":12,"rank_position":1,
    #|  "latest_created_at":"2026-01-01T00:00:00Z","repository_present":true,"license_present":true,
    #|  "normalized_full_text":"alice/json alice json json parser","normalized_owner":"alice",
    #|  "normalized_package":"json","normalized_description":"json parser","normalized_license":"mit",
    #|  "normalized_repository":"","normalized_keywords":["json"]},
    #| {"full_name":"bob/csv","rank_label":"C","momentum_label":"New","score":60,
    #|  "score_growth_30d":0,"download_count":0,"dependent_count":0,"recent_dependent_count":0,
    #|  "external_dependent_count":0,"dependent_owner_count":0,"days_since_release":400,"rank_position":2,
    #|  "latest_created_at":null,"repository_present":false,"license_present":false,
    #|  "normalized_full_text":"bob/csv bob csv csv reader","normalized_owner":"bob",
    #|  "normalized_package":"csv","normalized_description":"csv reader","normalized_license":"",
    #|  "normalized_repository":"","normalized_keywords":[]}
    #|]}
  let items = @static_search.parse_index(index)
  let result = @static_search.search_items(items, { "q": "JSON" })
  inspect(result.total, content="1")
  inspect(items[result.indices[0]].full_name, content="alice/json")
}
```

The parameters are those of the web interface; see the
[query tutorial](query.md) for the expression language. The package builds
for every target, so `moon test --target all` runs this on each backend.

## Everyday tasks

### Build and serve the static site

From the repository root:

```bash
npm install
npm run build:static-data   # builds cli, the database and public/data
npm run build:static        # builds the MoonBit modules, then next build into out/
npm run serve:static        # serves out/ on http://localhost:4173
```

`build:static-data` needs the local registry index under
`~/.moon/registry/index/user` (run `moon update` first). The search index is
`public/data/search/search-index.json`; the browser loads it once into a Web
Worker, which runs the MoonBit engine compiled to JavaScript.

### Write queries

| Query | Finds |
| --- | --- |
| `json` | packages whose name, owner, description or keywords contain `json` |
| `"http client"` | the substring `http client`, space included |
| `owner:moonbitlang AND keyword:json` | packages of that owner with a keyword containing `json` |
| `(yaml OR toml) AND NOT rank=D` | YAML or TOML packages outside rank `D` |
| `momentum=rising AND recent_dependents>=5` | fast-growing packages with at least five recent dependents |
| `age<=30 AND owners>=2` | released in the last 30 days and used by two other owners |

The flat filters of the interface work too: `rank=S,A` in the URL keeps
ranks `S` and `A`, and `limit` and `offset` page through the results.

### Understand the order of results

Without an explicit sort, a query orders results by how many of its
positive terms a package matches, then by rank position, then by name;
without a query the list is ordered by rank position. With an explicit
sort, `order` flips the key, and ties are always listed best-ranked first.

```moonbit
test "order of results" {
  fn item(name : String, text : String, score : Double) -> @static_search.IndexItem {
    {
      full_name: name,
      rank_label: "C",
      momentum_label: "Stable",
      score,
      score_growth_30d: 0.0,
      download_count: 0.0,
      dependent_count: 0.0,
      recent_dependent_count: 0.0,
      external_dependent_count: 0.0,
      dependent_owner_count: 0.0,
      days_since_release: 0.0,
      rank_position: 0.0,
      latest_created_at: None,
      repository_present: false,
      license_present: false,
      normalized_full_text: @static_search.normalize_text("\{name} \{text}"),
      normalized_owner: "",
      normalized_package: "",
      normalized_description: "",
      normalized_license: "",
      normalized_repository: "",
      normalized_keywords: [],
    }
  }

  let items = [
    item("alice/json", "Fast JSON parser", 120.0),
    item("bob/toml", "TOML parser", 300.0),
    item("carol/yaml", "YAML and JSON emitter", 80.0),
  ]
  let result = @static_search.search_items(items, { "expr": "json OR parser" })
  debug_inspect(result.indices.map(i => items[i].full_name), content=(
    #|["alice/json", "bob/toml", "carol/yaml"]
  ))
}
```

`alice/json` matches both words; the other two match one each and are
ordered by rank position (all positions are `0` here, so by name). For `json AND parser` every result matches both words, so
the order is the plain score order.

### Use the engine from JavaScript

`npm run build:moonbit` writes `lib/moonbit/static_search/static_search.js`.
`lib/static-search.ts` wraps it:

```ts
import { loadStaticSearchIndex, searchStaticIndex } from "../lib/static-search";

loadStaticSearchIndex(indexText);                      // once
const page = searchStaticIndex({ q: "json", limit: "20" });
page.indices;                                          // positions in the index
page.total;                                            // matches before paging
```

## Pitfalls

- **Implicit AND.** `json parser` without `AND` is a syntax error in the
  expression language. In the simple search field (`q`) the same text is one
  substring, `json parser`.
- **Field operators.** `score:180` means `score = 180`, not at least 180.
  Use `score>=180`.
- **`NOT` does not raise relevance.** Only positive terms count, so for
  `NOT rank=D OR json` every package that mentions `json` ranks above the
  rest, by score among themselves, whatever its rank.
- **Index fields.** An index exported before scoring v2 lacks
  `rank_position` and the other new counts; `load_index` rejects it. Export
  the data again.

## Next steps

- [static_search design](../design/static_search.md) for the index layout,
  the relevance count, the collation and the cost of a query.
- [static_search API](../api/static_search.md) for every function and the
  JavaScript exports.
- [query tutorial](query.md) for the expression language.
- [architecture guide](../architecture.md) for the whole data pipeline.
