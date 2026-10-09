# static_search design

The static publishing mode serves the whole application as files, without a
server or SQLite. Search then runs in the browser over a precomputed index.
This page describes that index and the search algorithm of the MoonBit
package `static_search`, derives what the ranking means and what it costs,
and explains how the browser runs it. The
[static_search API](../api/static_search.md) lists the functions.

| Piece | Language | Role |
| --- | --- | --- |
| [`src/query`](../../../src/query/ast.mbt) | MoonBit | Query language, flat parameters, sort keys, paging ([design](query.md)). |
| [`src/static_search`](../../../src/static_search/search.mbt) | MoonBit | Index loading, evaluation, relevance, sorting, paging. |
| [`scripts/export_static_json.py`](../../../scripts/export_static_json.py) | Python | Writes the index and the other static files from the SQLite database. |
| [`lib/static-search.ts`](../../../lib/static-search.ts) | TypeScript | Wraps the generated module. |
| [`frontend/src/static-search.worker.ts`](../../../frontend/src/static-search.worker.ts) | TypeScript | Loads the index into a Web Worker and answers search messages. |

## Design goal

Search on the static site must accept the same query forms as the dynamic
site (the native expression language, the serialised query tree and the
flat form fields), stay responsive while the page renders, need nothing but
files a static host can serve, and give the same results in every browser
and on every MoonBit backend.

## Mathematical background

### Data layout

`export_static_json.py` writes these files under `public/data/`:

| File | Content |
| --- | --- |
| `manifest.json` | `schema_version`, `generated_at`, `package_count`, `data_mode = "static"` and the size of each feed. |
| `feeds/*.json` | The feeds, precomputed with the SQL orderings of the dynamic site. |
| `search/search-index.json` | The search index: `{ "items": [...] }`, one record per package. |
| `search/packages.json` | The same packages with display fields. |
| `packages/<owner>--<package>.json` | Detail page data. |

A record of the search index holds the display fields of a package summary,
the counts used for filtering and sorting (`dependent_count`,
`recent_dependent_count`, `external_dependent_count`,
`dependent_owner_count`, `download_count`, `days_since_release`,
`rank_position`, `score`, `score_growth_30d`) and precomputed search keys:

| Key | Value |
| --- | --- |
| `normalized_owner`, `normalized_package`, `normalized_description`, `normalized_license`, `normalized_repository` | The field, trimmed and lower-cased (`""` when missing). |
| `normalized_keywords` | Each keyword, trimmed and lower-cased. |
| `normalized_full_text` | The non-empty parts of full name, owner, package name, description and keywords, joined by single spaces. |
| `repository_present`, `license_present` | Whether the trimmed field is non-empty. |
| `latest_created_at` | The release timestamp; its first four characters give the year. |

So the index is a *forward* index: an array of $N$ records with $F$ fixed
fields each. There is no inverted index and no tokenisation. Lower-casing at
export time means that a query only has to normalise the needle.

### Queries as Boolean formulas

Every request is first turned into a query tree by `@query.derive_ast`: a
serialised `ast` parameter, else a native `expr`, else the flat fields
joined by AND (a `rank` or `momentum` list becoming an OR of labels). A tree
is a formula over term predicates,

$$
\varphi ::= t \mid \lnot\varphi \mid \varphi_1 \land \dots \land \varphi_k \mid \varphi_1 \lor \dots \lor \varphi_k ,
$$

and a term $t = (f, \mathit{op}, v)$ is evaluated on a record $p$ as

| Field $f$ | $p \models t$ when |
| --- | --- |
| `text`, `owner`, `package`, `description`, `license`, `repository` | $\nu(v)$ is a substring of the normalised field ($\nu$ = trim and lower-case); an empty needle always matches. |
| `keyword` | $\nu(v)$ is a substring of at least one normalised keyword. |
| `rank`, `momentum` | the label equals the canonical label of $v$ (case and surrounding spaces ignored). |
| numeric fields | $x \ge v$ for `>=`, $x \le v$ for `<=`, $x = v$ otherwise, with $v$ read by `number_value` (ECMAScript `Number`); false when $v$ is not finite. An empty $v$ reads as $0$. |
| `has_repository`, `has_license` | the flag equals `v == "true"`. |

The result set is $\{\, p : p \models \varphi \,\}$, evaluated recursively
with short-circuiting `all` and `any`. A tree without any non-empty term
matches every record.

### Relevance

When there is a query and no explicit sort, results are ordered by a
relevance count. With $L^{+}(\varphi)$ the multiset of *positive* term
leaves of the tree,

$$
\operatorname{rel}(p) = \bigl|\{\, t \in L^{+}(\varphi) : p \models t \,\}\bigr| ,
$$

where a leaf is positive when it lies below an even number of negations,
counting its own `NOT` and those of the groups above it. Ties are broken by
rank position (ascending, which is score descending) and then by name
(`collate`, ascending).

**Conjunctions do not reorder.** Let $\varphi = t_1 \land \dots \land t_k$
with positive terms. Every result satisfies every $t_i$, so
$\operatorname{rel}(p) = k$ for all results, and the order is exactly the
score order. Relevance only has an effect when the formula contains `OR` or
`NOT`.

**Disjunctions rank by coverage.** For $\varphi = t_1 \lor \dots \lor t_k$
with positive terms, $\operatorname{rel}(p)$ is the number of alternatives
that $p$ satisfies, so a package that matches every alternative comes first.

**Negated leaves add nothing.** A negative leaf contributes $0$ to every
package. For $\varphi = \lnot t_1 \lor t_2$,

$$
\operatorname{rel}(p) = [\,p \models t_2\,],
$$

so the packages that satisfy $t_2$ come first, ordered by score, whether or
not they also satisfy the excluded $t_1$. Counting the un-negated leaf
instead would add $[\,p \models t_1\,]$ and rank first exactly the packages
the query excludes; releases before the fix of
[#4](https://github.com/Luna-Flow/mooncake_impact_factor/issues/4) did
that. The rule generalises through groups: $\lnot(\lnot t)$ is positive
again, because the polarity is the parity of the negations on the path.

Relevance is therefore a coordination-level match[^coord], not a text
statistic: it ignores term frequency, field length and how rare a term is.

[^coord]: Coordination-level matching ranks documents by the number of query
    terms they contain; it is the simplest ranked retrieval model and
    predates tf–idf weighting (Salton and McGill, *Introduction to Modern
    Information Retrieval*, 1983).

### Sort orders and tie-breaking

The other sort keys are `score`, `growth`, `downloads`, `dependents`,
`recent`, `updated` (the release year), `external`, `owners`, `position`,
`age` and `name`. Each comparison is

$$
c(a, b) = s \cdot \bigl(\operatorname{key}(a) - \operatorname{key}(b)\bigr) \;\Vert\; \bigl(a.\mathit{position} - b.\mathit{position}\bigr) \;\Vert\; \operatorname{collate}(a.\mathit{name}, b.\mathit{name}),
$$

where $x \Vert y$ means "$x$ if non-zero, else $y$" and $s = -1$ for
descending, $+1$ for ascending order. The default order is ascending for
`name`, `position` and `age` and descending for the other keys; without a
query the default key is `position`, so the list starts with the best
package. $s$ multiplies only the key, so ties are listed best-ranked first
in both directions, exactly as on the server. Equal comparisons fall back
to the index order, so the sort is total and deterministic.

### Collation

The TypeScript worker compared names with `localeCompare`, whose result
depends on the browser's locale and ICU version. `collate` fixes the order:
for each name it builds a key of (primary, secondary, tertiary) weights per
character and compares the primary weights of the whole string first, then
the secondary, then the tertiary, and finally the UTF-16 code units:

| Characters | Primary weight | Tertiary |
| --- | --- | --- |
| tab to CR, space | lowest, in that order | |
| ASCII punctuation | ``_ - , ; : ! ? . ' " ( ) [ ] { } @ * / \ & # % ` ^ + < = > \| ~ $`` in this order | |
| other punctuation, symbols, emoji | after ASCII punctuation, by code point | |
| digits | after punctuation | |
| letters | after digits, `a` = `A` | lower case before upper case |
| Latin-1 letters with diacritics | their base letter (secondary: the accent) | case |
| other scripts | after Latin, by code point | |
| ASCII control characters | ignored | |

This is the CLDR root collation for ASCII, which is what `localeCompare`
gives in an English browser, so the 1280 names of the current index sort
exactly as before. Because primary weights are compared over the whole
string first, `aB` sorts before `Ab` (they differ only in case, and the
first case difference is at position 0).

## Design decisions

### Scan a forward index instead of building an inverted one

**Problem.** The browser needs to answer substring, numeric and Boolean
queries without a database.

**Options.** Ship SQLite compiled to WebAssembly with the FTS5 index; build
an inverted index (term → packages) at export time; scan an array of
records.

**Choice.** A linear scan. The registry has a few thousand packages, so one
query touches a few thousand short records, which is cheap for a worker.
Substring matching (`pars` finds `parser`) and numeric filters need no
tokenizer and no posting lists, and the index stays a plain JSON file.

### Move the engine to MoonBit

**Problem.** Evaluation and sorting were TypeScript and had to agree with
the query language, which moved to MoonBit, and they depended on the host
for lower-casing and name order.

**Choice.** The engine is the MoonBit package `static_search`, built for
every target. The worker calls two exports: `load_index` once and `search`
per request. The search returns indices instead of records, so the worker
keeps its own parsed records for display and only small JSON strings cross
the boundary.

### The worker

The worker loads `search-index.json` once, validates it with the zod schema
of `frontend/src/types.ts`, hands the text to `load_index` and keeps the
records. Messages:

| Direction | Message |
| --- | --- |
| page → worker | `{ type: "init", id, indexUrl }` |
| worker → page | `{ type: "ready", id }` |
| page → worker | `{ type: "search", id, params }` with the web interface parameters as strings |
| worker → page | `{ type: "result", id, items, total }`: one page of records and the number of matches |
| worker → page | `{ type: "error", id, message }`, for example `rank must be one of S, A, B, C, D` |

Each reply carries the request `id`, so concurrent queries cannot be
confused. The index URL carries `generated_at` from the manifest, and a new
manifest restarts the worker, so a stale index is never mixed with new
feeds. The static site is built with webpack because Turbopack copied the
worker's source file instead of bundling it.

### Normalise once, at export

Python lower-cases the records at export (`str.strip().lower()`); the engine
lower-cases only the needle, with its own table (`normalize_text`) instead
of the host's `toLowerCase`, so every backend gives the same needle. The
table covers the scripts package metadata uses; elsewhere the two sides may
differ, for example for the final `ς`.

## Correctness / invariants

### Agreement with the dynamic site

The worker and the server derive trees with the same MoonBit package, so a
query means the same formula in both modes. The term semantics differ on
purpose:

- Text terms are substring tests in the static site, so `pars` also finds
  `sparse`. The server sends them to SQLite FTS5, which matches token
  prefixes (`pars*`). `license` and `repository` are substring tests in both
  modes.
- The server rejects a term whose operator does not fit its field (for
  example `rank>=A`) with HTTP 400; the static engine evaluates it anyway.
- With a query and no explicit sort, the static site orders by the
  coordination count above. The server orders tree queries by score and
  ranks flat text queries by FTS5 `bm25`.
- An empty numeric value compares with $0$ in the static site; the server
  rejects it with HTTP 400. Unknown rank or momentum labels in a term match
  nothing in the static site and are rejected by the server; in the flat
  `rank` and `momentum` parameters both modes reject them.
- `updated` sorts by year in the static site and by the full timestamp on
  the server.
- Ties are broken by rank position and then by name in both modes; the
  static site compares names with `collate`, the server with SQLite's
  binary order.

Both modes page with `limit` (default 50, at most 200) and `offset`, and
report the number of matches before paging.

### Complexity

Let $N$ be the number of records, $L$ the number of term leaves of the query
and $\ell$ the length of the longest normalised field. One term test costs
$O(1)$ for numeric, label and flag terms and at most $O(\ell\,|v|)$ for a
substring test. Then

$$
\begin{aligned}
T_{\text{load}} &= O(\text{size of the JSON}) = O(N F \ell), \\
T_{\text{filter}} &= O(N \cdot L \cdot \ell |v|), \\
T_{\text{relevance}} &= O(N \cdot L \cdot \ell |v|), \\
T_{\text{sort}} &= O(N \log N) \text{ comparisons}.
\end{aligned}
$$

Relevance is computed once per record before sorting, so a comparison costs
$O(1)$ for the keys and the position plus a name collation of $O(\ell)$
on full ties. (The
TypeScript worker recomputed relevance inside the comparator, which cost an
extra factor of $\log N$ term tests.) Paging only cuts the sorted array, so
$T$ does not depend on the page. Memory is $O(N F \ell)$ for the resident
index, held twice: once as MoonBit records, once as the worker's display
objects.

## Alternatives rejected

- **SQLite in WebAssembly** would make static and dynamic results identical
  but costs a large download and a WebAssembly runtime on every visit.
- **A client-side full-text library** (inverted index with tf–idf or BM25)
  would rank better for free text but needs a tokenizer that agrees with the
  FTS5 tokenizer to be consistent, and loses substring matching.
- **Returning records from MoonBit** instead of indices would double the
  JSON work per search.

## Boundaries

- The static search does not tokenise, stem or rank by text statistics, and
  it does not correct spelling.
- The data is as fresh as the last export; there is no incremental update.
- The index must contain the scoring v2 fields (`external_dependent_count`,
  `dependent_owner_count`, `days_since_release`, `rank_position`);
  `load_index` rejects records without them.
