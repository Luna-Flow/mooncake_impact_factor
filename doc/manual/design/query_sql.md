# query_sql design

This page explains how [`src/query_sql`](../../../src/query_sql/plan.mbt)
turns search requests into SQLite queries, why there are two compilation
paths, and what the generated SQL guarantees. The
[query_sql API](../api/query_sql.md) lists the functions.

## Design goal

The dynamic site must answer every request with one parameterised SQL
statement, reject malformed requests with a message instead of an SQLite
error, and give the same meaning to a query tree as the static site. The
compiler must be pure, so it can be tested without a database and run
identically on every backend.

## Mathematical background

### Query trees as conditions

`compile_ast` is a homomorphism from query trees to SQL conditions:

$$
\begin{aligned}
C(t) &= \text{condition of the term } t, \\
C(\lnot \varphi) &= \texttt{NOT (} C(\varphi) \texttt{)}, \\
C(\varphi_1 \land \dots \land \varphi_k) &= \texttt{(}C(\varphi_1)\texttt{) AND } \dots \texttt{ AND (}C(\varphi_k)\texttt{)}, \\
C(\varnothing) &= \texttt{1 = 1},
\end{aligned}
$$

and likewise for $\lor$. Because every part is parenthesised, SQL operator
precedence never changes the meaning, and the placeholders appear in the
order of a left-to-right walk, which is the order of `values`.

One difference from the static evaluator: an empty `Or` group compiles to
`1 = 1` (true), while the static site evaluates it as false. The parser
never produces empty groups; only a hand-built tree can contain one.

### Two paths

A request can carry a query tree (`ast` or `expr`) or flat parameters
(`q`, `owner`, `min_score`, …). The flat path is *not* "derive a tree, then
compile it", because three of its behaviours have no equivalent in a tree:

- `q` is a full FTS5 expression with its own `AND`/`OR`/`NOT`, parentheses
  and field aliases (`author:`, `tag:`, `name:`), while a `text` term holds
  one operand;
- the text parameters are matched by joining `search_index`, so the
  default order can use FTS5's `bm25` rank, while tree terms are `EXISTS`
  subqueries without a rank;
- the flat numeric parameters have range checks (`min_score >= 0`,
  `min_score <= max_score`, years in $[1970, 9999]$) that a tree does not
  express.

So `plan_search` keeps both paths, as `lib/data.ts` did, but in MoonBit:
validation first (both paths validate every parameter), then the tree path
when `ast` or `expr` has intent, else the flat path.

### FTS5 operands

For a text value $v$, let $\nu(v)$ keep ASCII letters, digits and
`_ . - * #` and collapse everything else to single spaces. The operand is

$$
\operatorname{op}(v) =
\begin{cases}
\texttt{"}\nu(v)\texttt{"} & \nu(v) \text{ has a space or one of } \texttt{. - \#} \\
\nu(v) & \nu(v) \text{ ends with } \texttt{*} \\
\nu(v)\texttt{*} & \text{otherwise}
\end{cases}
$$

A plain word becomes a prefix query, so `pars` finds `parser`; anything
FTS5 would tokenize into several tokens becomes a phrase, so
`moonbit-community/json5` finds the two tokens in order. Non-ASCII text is
dropped by $\nu$, because the FTS5 tokenizer of the index is ASCII-only.

### Ordering and paging

Every `ORDER BY` clause ends with `s.rank_position ASC, p.full_name ASC`
(or is the name itself), so the order is total and `LIMIT ? OFFSET ?` pages
never overlap or skip rows. The tie-break does not follow `order`: a
descending sort by downloads lists equal download counts best-ranked
first, as an ascending one does. The total is a
`COUNT(*)` with the same `FROM` and `WHERE`, so it counts exactly the rows
the pages are cut from.

## Design decisions

### Validate before SQLite sees anything

`compile_fts_expression` checks the token structure (operands alternate
with operators, parentheses balance, quotes close) and raises a message for
each case. FTS5 would otherwise answer `fts5: syntax error`, which
`lib/data.ts` can only translate into a generic message.

### Errors are client errors

Every `SqlError`, including a malformed `ast` or `expr`, is HTTP 400.
Before the port a malformed tree was a plain exception and became HTTP 500.

### Rank position as the default order

Without a text query the list is ordered by `s.rank_position`, the position
in the score ranking, which equals score descending with a fixed tie-break,
and is what the interface shows as "#n".

## Correctness / invariants

- The same parameters always give the same SQL text and values.
- Only values are bound; field names and clauses come from fixed tables, so
  no user text reaches the SQL text.
- `sort` accepts only the listed keys. (The TypeScript version accepted
  inherited object properties such as `constructor` and produced invalid
  SQL.)

## Complexity

Compiling a tree with $m$ nodes is $O(m)$ string work; compiling `q` is
linear in its length. The SQL itself costs one FTS5 lookup per text term
(`EXISTS` subqueries on `rowid`), plus a sort of the matching rows.

## Boundaries

- The package does not open the database; `lib/data.ts` does.
- The FTS5 tokenizer is ASCII-only, so non-ASCII words cannot be searched
  in the dynamic site.
- `getFeedPackages` (the feeds) is not part of this package.
