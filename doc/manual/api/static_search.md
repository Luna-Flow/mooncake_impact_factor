# static_search API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/static_search` is the search
engine of the static site. It reads the exported search index, evaluates
[`query`](query.md) trees against its records, counts relevance, sorts with
the static site's rules and cuts pages. The browser runs it in a Web Worker
through the generated JavaScript module; MoonBit code can call it directly.

The package is pure MoonBit and builds for every target. Text is
lower-cased and names are collated by the package itself, so the results do
not depend on the host's `toLowerCase` or `localeCompare`.

Source: [`src/static_search`](../../../src/static_search/search.mbt). The
[static_search design](../design/static_search.md) derives the ranking and
its cost.

## Importing

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
  "Luna-Flow/mooncake-impact-factor/static_search",
}
```

## Index records

```mbti
pub(all) struct IndexItem {
  full_name : String
  rank_label : String
  momentum_label : String
  score : Double
  score_growth_30d : Double
  download_count : Double
  dependent_count : Double
  recent_dependent_count : Double
  external_dependent_count : Double
  dependent_owner_count : Double
  days_since_release : Double
  rank_position : Double
  latest_created_at : String?
  repository_present : Bool
  license_present : Bool
  normalized_full_text : String
  normalized_owner : String
  normalized_package : String
  normalized_description : String
  normalized_license : String
  normalized_repository : String
  normalized_keywords : Array[String]
}
pub fn IndexItem::from_json(Json) -> Self raise IndexError
pub fn parse_index(String) -> Array[IndexItem] raise IndexError

pub suberror IndexError {
  IndexError(String)
}
pub fn IndexError::message(Self) -> String
```

One record of `search/search-index.json`, as far as searching needs it; the
`normalized_*` texts are lower case already. `from_json` reads one record
and ignores unknown members; a missing or mistyped member raises
`IndexError("Index item field `<name>` must be …")`. `parse_index` reads a
document `{"items": [ … ]}` or a bare array.

## Evaluating queries

```mbti
pub fn match_term(IndexItem, @query.Term) -> Bool
pub fn evaluate(IndexItem, @query.Node) -> Bool
pub fn relevance(IndexItem, @query.Group) -> Int
pub fn package_year(IndexItem) -> Double
```

`match_term` tests one term, ignoring its negation:

| Field | Holds when |
| --- | --- |
| `text`, `owner`, `package`, `description`, `license`, `repository` | the trimmed, lower-cased value is a substring of the record's text (a blank value always holds) |
| `keyword` | the same test holds for one of the keywords |
| `rank`, `momentum` | the label equals the value read with `@query.parse_label` (case and surrounding spaces ignored); a value that is no label is compared as given |
| `score`, `dependents`, `recent_dependents`, `external_dependents`, `owners`, `downloads`, `year`, `age`, `position` | the number compares with `@query.number_value(value)`: `>=`, `<=`, and `=` for both `=` and `:`; never for a value that is not a finite number |
| `has_repository`, `has_license` | the flag equals `value == "true"` |

`evaluate` applies negation and the connectives (an empty `And` group holds,
an empty `Or` group does not). `relevance` counts the positive term leaves
the record matches; a leaf below an odd number of `NOT`s counts zero.
`package_year` reads the first four characters of `latest_created_at` (`0`
when missing or not a number).

```moonbit
test "relevance ignores negated leaves" {
  let ast = @query.parse_expression("NOT rank=D OR json")
  let item : @static_search.IndexItem = {
    full_name: "dave/jsond",
    rank_label: "D",
    momentum_label: "Stable",
    score: 10.0,
    score_growth_30d: 0.0,
    download_count: 0.0,
    dependent_count: 0.0,
    recent_dependent_count: 0.0,
    external_dependent_count: 0.0,
    dependent_owner_count: 0.0,
    days_since_release: 40.0,
    rank_position: 3.0,
    latest_created_at: Some("2026-01-01T00:00:00Z"),
    repository_present: false,
    license_present: false,
    normalized_full_text: "dave/jsond dave jsond json parser",
    normalized_owner: "dave",
    normalized_package: "jsond",
    normalized_description: "json parser",
    normalized_license: "",
    normalized_repository: "",
    normalized_keywords: [],
  }
  inspect(@static_search.evaluate(item, Group(ast)), content="true")
  inspect(@static_search.relevance(item, ast), content="1")
  inspect(@static_search.package_year(item), content="2026")
}
```

## Searching

```mbti
pub(all) struct SearchResult {
  indices : Array[Int]
  total : Int
}
pub fn search_items(Array[IndexItem], Map[String, String]) -> SearchResult raise @query.QueryError
pub fn sort_indices(Array[IndexItem], Array[Int], @query.Group, sort~ : String, order~ : String) -> Array[Int]
```

`search_items(items, params)` runs one search with the parameters of the
web interface (`q`, `owner`, `packageName`, …, `rank`, `momentum`, `sort`,
`order`, `expr`, `ast`, `limit`, `offset`): it derives the tree with
`@query.derive_ast`, keeps the records for which `evaluate` holds (all of
them when the tree has no intent), sorts them with `sort_indices` and
returns the page given by `@query.page_limit` and `@query.page_offset`.
`indices` refer to `items`; `total` is the number of matches before paging.
An invalid query or label raises `QueryError`.

`sort_indices` orders record indices:

- a blank `sort` is `relevance` when the tree has intent and `position`
  otherwise; a blank `order` is `asc` for `relevance`, `name`, `position`
  and `age` and `desc` for the others; an unknown `sort` orders like
  `score`;
- `relevance` sorts by relevance (most first) and ignores `order`;
- every other key compares its value (`score`, `score_growth_30d`,
  `download_count`, `dependent_count`, `recent_dependent_count`, the
  release year for `updated`, `external_dependent_count`,
  `dependent_owner_count`, `rank_position`, `days_since_release`) in the
  chosen direction; `name` compares names with `collate`;
- ties are broken by rank position (best first), then by name with
  `collate` (ascending), whatever the direction, and finally by index.

## Text

```mbti
pub fn normalize_text(String) -> String
pub fn collate(String, String) -> Int
pub fn runtime_version() -> String
```

`normalize_text` lower-cases ASCII, Latin-1, Latin Extended-A, Greek and
Coptic, Cyrillic (U+0400 to U+052F) and the fullwidth Latin capitals like
ECMAScript `toLowerCase`, except that `Σ` always becomes `σ`; other
characters are kept. `collate` compares names: negative when the first
sorts first, zero only for identical strings. For ASCII it is the CLDR root
order that `localeCompare` gives in an English browser (punctuation, then
digits, then letters with case ignored, then lower case before upper
case). `runtime_version` is `"static-search-v2"`.

```moonbit
test "text" {
  inspect(@static_search.normalize_text("JSON Ärger"), content="json ärger")
  let names = ["b/x", "A/x", "a-b/x", "a/x"]
  names.sort_by(@static_search.collate)
  debug_inspect(names, content=(
    #|["a-b/x", "a/x", "A/x", "b/x"]
  ))
}
```

## JavaScript boundary

`moon build src/static_search --target js` writes an ES module with these
exports; `scripts/build_moonbit.mjs` copies it to
`lib/moonbit/static_search/`, and [`lib/static-search.ts`](../../../lib/static-search.ts)
wraps it.

| Export | Type | Meaning |
| --- | --- | --- |
| `load_index` | `(json: string) => number` | parse an index document and keep it; the number of items, or `-1` (previous index kept) |
| `search` | `(params_json: string) => string` | `{"ok":{"indices":[…],"total":n}}` or `{"error":"<message>"}` over the loaded index |
| `evaluate_json` | `(item_json: string, ast_json: string) => string` | envelope of `evaluate` |
| `relevance_json` | `(item_json: string, ast_json: string) => string` | envelope of `relevance` |
| `normalize_text` | `(input: string) => string` | as above |
| `runtime_version` | `() => string` | `"static-search-v2"` |

The worker protocol built on it is described in the
[static_search design](../design/static_search.md#the-worker).
