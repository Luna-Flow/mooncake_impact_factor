# static_search design

The static publishing mode serves the whole application as files, without a
server or SQLite. Search then runs in the browser over a precomputed index.
This page describes that index and its query algorithm, derives what the
ranking means and what it costs, and explains the role of the MoonBit
`static_search` package in it. The [static_search API](../api/static_search.md)
lists the MoonBit functions.

Three pieces work together:

| Piece | Language | Role |
| --- | --- | --- |
| [`src/static_search`](../../../src/static_search/search.mbt) | MoonBit (JS) | Version tag and lower-case normalisation. |
| [`scripts/export_static_json.py`](../../../scripts/export_static_json.py) | Python | Writes the index and the other static files from the SQLite database. |
| [`frontend/src/static-search.worker.ts`](../../../frontend/src/static-search.worker.ts) | TypeScript | Loads the index into a Web Worker, filters and sorts. |
| [`lib/static-search.ts`](../../../lib/static-search.ts) | TypeScript | Evaluates query terms and counts relevance for the worker. |

## Design goal

Search on the static site must accept the same query forms as the dynamic
site (the native expression language, the serialised query AST and the
simple form fields), stay responsive while the page renders, and need nothing
but files that a static host such as GitHub Pages can serve.

## Mathematical background

### Data layout

`export_static_json.py` writes these files under `public/data/`:

| File | Content |
| --- | --- |
| `manifest.json` | `schema_version`, `generated_at`, `package_count`, `data_mode = "static"` and the size of each feed. |
| `feeds/top.json`, `feeds/hot.json`, `feeds/rising.json` | The three feeds, precomputed with the SQL orderings of the dynamic site. |
| `search/search-index.json` | The search index: `{ "items": [...] }`, one record per package. |
| `search/packages.json` | The same packages with display fields (keywords, version count, multiplier). |
| `packages/<owner>--<package>.json` | Detail page data: package, last 20 versions, dependents. |

A record of the search index is a flat object. Besides the display fields of
a package summary (name, owner, description, version, counts and the score
snapshot fields) it holds precomputed search keys:

| Key | Value |
| --- | --- |
| `normalized_owner`, `normalized_package`, `normalized_description`, `normalized_license`, `normalized_repository` | The field, trimmed and lower-cased (`""` when missing). |
| `normalized_keywords` | Each keyword, trimmed and lower-cased. |
| `normalized_full_text` | The non-empty parts of full name, owner, package name, description and keywords, joined by single spaces. |
| `repository_present`, `license_present` | Whether the trimmed field is non-empty. |
| `latest_created_at` | The release timestamp; its first four characters give the year. |

So the index is a *forward* index: an array of $N$ records with $F$ fixed
fields each, sorted by `full_name`. There is no inverted index and no
tokenisation. Lower-casing at export time means that a query only has to
normalise the needle, not every record, at query time.

### Queries as Boolean formulas

Every query is first turned into a query AST by `deriveQueryAst` in
[`lib/query.ts`](../../../lib/query.ts), with this precedence: a serialised
`ast` parameter, else a native `expr`, else the legacy form fields joined by
AND. An AST is a formula over term predicates:

$$
\varphi ::= t \mid \lnot\varphi \mid \varphi_1 \land \dots \land \varphi_k \mid \varphi_1 \lor \dots \lor \varphi_k ,
$$

and a term $t = (f, \mathit{op}, v)$ is evaluated on a record $p$ as

| Field $f$ | $p \models t$ when |
| --- | --- |
| `text`, `owner`, `package`, `description`, `license`, `repository` | $\nu(v)$ is a substring of the normalised field ($\nu$ = trim and lower-case); an empty needle always matches. |
| `keyword` | $\nu(v)$ is a substring of at least one normalised keyword. |
| `rank`, `momentum` | the label equals $v$ exactly. |
| `score`, `dependents`, `recent_dependents`, `downloads`, `year` | $x \ge v$ for `>=`, $x \le v$ for `<=`, $x = v$ otherwise, with $v$ converted by JavaScript `Number`; false when the conversion is not finite. An empty $v$ converts to $0$. |
| `has_repository`, `has_license` | the flag equals `v == "true"`. |

The result set is $\{\, p : p \models \varphi \,\}$, evaluated recursively
with short-circuiting `every` and `some`. An AST without any non-empty term
matches every record.

### Relevance

When there is a query and no explicit sort, the worker orders results by a
relevance count. With $L^{+}(\varphi)$ the multiset of *positive* term
leaves of the AST,

$$
\operatorname{rel}(p) = \bigl|\{\, t \in L^{+}(\varphi) : p \models t \,\}\bigr| ,
$$

where a leaf is positive when it lies below an even number of negations,
counting its own `NOT` and those of the groups above it. Ties are broken by score (descending) and then by `full_name`
(ascending, by `localeCompare`).

Two consequences are worth deriving because they explain what users see.

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
that.

Relevance is therefore a coordination-level match[^coord], not a text
statistic: it ignores term frequency, field length and how rare a term is.

[^coord]: Coordination-level matching ranks documents by the number of query
    terms they contain; it is the simplest ranked retrieval model and
    predates tf–idf weighting (Salton and McGill, *Introduction to Modern
    Information Retrieval*, 1983).

### Sort orders and tie-breaking

The other sort keys are `score`, `growth`, `downloads`, `dependents`,
`recent`, `updated` (the release year) and `name`. Each comparison is

$$
c(a, b) = s \cdot \bigl(\operatorname{key}(a) - \operatorname{key}(b) \;\Vert\; \operatorname{cmp}(a.\mathit{name}, b.\mathit{name})\bigr),
$$

where $x \Vert y$ means "$x$ if non-zero, else $y$" and $s = -1$ for
descending, $+1$ for ascending order. The default order is ascending for
`name` and descending for the other keys. Because $s$ multiplies the whole
expression, a descending sort also reverses the name order of ties. Full
names are unique, so ties are always resolved and the same index and query
give the same order.

## Design decisions

### Scan a forward index instead of building an inverted one

**Problem.** The browser needs to answer substring, numeric and Boolean
queries without a database.

**Options.** Ship SQLite compiled to WebAssembly with the FTS5 index; build
an inverted index (term → packages) at export time; scan an array of
records.

**Choice.** A linear scan. The registry has a few thousand packages, so one
query touches a few thousand short records, which is cheap for a worker. Substring matching (`pars` finds `parser`) and numeric filters
need no tokenizer and no posting lists, and the index stays a plain JSON file
that the export script writes in a few lines. A WebAssembly database would
add a large download to every visit.

### Run the search in a Web Worker

**Problem.** Parsing the whole index and sorting it on the main thread would
block rendering.

**Choice.** The worker loads `search-index.json` once and keeps the records
in memory; queries are messages with an `id`, and each reply resolves the
request with the same `id`, so concurrent queries cannot be confused. The URL carries `generated_at` from the manifest as
a version parameter, and a new manifest terminates and restarts the worker,
so a stale index is never mixed with new feeds.

### Normalise once, at export

**Problem.** Case-insensitive matching needs lower-cased text on both sides.

**Choice.** Python lower-cases the records at export (`str.strip().lower()`);
the worker lower-cases only the needle (`trim().toLowerCase()`). Both apply
the Unicode default case mapping, so for ordinary package metadata the two
sides agree. The MoonBit `normalize_text` implements the lower-casing step
through the same JavaScript function, so that MoonBit code compiled for the
static site normalises text exactly as the worker does.

### Keep the version tag in MoonBit

`runtime_version` gives the compiled JavaScript module a fixed identity. The
static build (`scripts/build_static_site.mjs`) compiles the package before
`next build`, so a MoonBit change that breaks the module stops the static
build.

## Correctness / invariants

### Agreement with the dynamic site

The worker and the server decode `ast` and `expr` with the same functions from
`lib/query.ts`, so a query means the same formula in both modes. The term
semantics differ on purpose:

- Text terms (`text`, `owner`, `package`, `keyword`, `description`) are
  substring tests in the static site, so `pars` also finds `sparse`. The
  server sends them to SQLite FTS5, which matches token prefixes (`pars*`).
  `license` and `repository` are substring tests in both modes.
- The server rejects a term whose operator does not fit its field (for
  example `rank>=A`) with HTTP 400; the worker evaluates it anyway, using
  equality for labels and numbers and a substring test for text.
- With a query and no explicit sort, the static site orders by the
  coordination count above. The server orders AST queries by score and
  ranks legacy text queries by FTS5 `bm25`.
- Rank and momentum values must match the label exactly in the static site
  (`rank=s` matches nothing). The server accepts them in any case and rejects
  unknown labels with HTTP 400.
- An empty numeric value compares with $0$ in the static site; the server
  rejects it with HTTP 400.
- `updated` sorts by year in the static site and by the full timestamp on the
  server.
- Ties in a descending static sort are broken by name descending. The server
  breaks ties by name ascending, after score descending for the `growth`,
  `downloads`, `dependents` and `recent` sorts.
- The server returns at most `limit` results (20 by default, at most 100);
  the static site returns every match.

### Complexity

Let $N$ be the number of records, $L$ the number of term leaves of the query
and $\ell$ the length of the longest normalised field. One term test costs
$O(\ell)$ for numeric and label terms and at most $O(\ell\,|v|)$ for a
substring test. Then

$$
\begin{aligned}
T_{\text{load}} &= O(\text{size of the JSON}) = O(N F \ell), \\
T_{\text{filter}} &= O(N \cdot L \cdot \ell |v|), \\
T_{\text{sort}} &= O(N \log N) \text{ comparisons}.
\end{aligned}
$$

A comparison costs $O(1)$ for the key sorts but $O(L \ell |v|)$ for relevance,
because the comparator recomputes $\operatorname{rel}$ for both records
instead of caching it. Relevance sorting is therefore
$O(N \log N \cdot L \ell |v|)$, a factor of $\log N$ more term tests than the
filter. Memory is $O(N F \ell)$ for the resident index. All results are
returned; there is no limit in static mode.

## Alternatives rejected

- **SQLite in WebAssembly** would make static and dynamic results identical
  but costs a large download and a WebAssembly runtime on every visit.
- **A client-side full-text library** (inverted index with tf–idf or BM25)
  would rank better for free text but needs a tokenizer that agrees with the
  FTS5 tokenizer to be consistent, and loses substring matching.
- **Splitting the index per owner or per letter** would shrink the first
  download but make OR queries across shards fetch many files.

## Boundaries

- The static search does not tokenise, stem or rank by text statistics, and
  it does not correct spelling.
- It returns every match; paging and limits are left to the interface.
- The MoonBit package does not implement the index or the query evaluation;
  those are in Python and TypeScript.
- In this release the worker does not import the MoonBit module; its
  TypeScript normalisation additionally trims the needle, which
  `normalize_text` does not.
- The data is as fresh as the last export; there is no incremental update.
