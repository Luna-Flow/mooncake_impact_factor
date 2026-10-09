# query_sql API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/query_sql` turns search
requests into SQL for the SQLite database of the dynamic site: a query tree
from [`query`](query.md) into a `WHERE` condition, the free-text `q` syntax
into an FTS5 `MATCH` expression, and the whole set of `/api/search`
parameters into a plan with `FROM`, `WHERE`, `ORDER BY`, `LIMIT` and
`OFFSET`. It only produces text and bound values; running the SQL is left
to [`lib/data.ts`](../../../lib/data.ts).

The package is pure MoonBit and builds for every target. Source:
[`src/query_sql`](../../../src/query_sql/compile.mbt). The
[query_sql design](../design/query_sql.md) explains the choices.

## Importing

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
  "Luna-Flow/mooncake-impact-factor/query_sql",
}
```

The SQL refers to the tables `packages p`, `package_scores s` and the FTS5
table `search_index` written by `scripts/build_index.py`.

## Errors

```mbti
pub suberror SqlError {
  SqlError(String)
}
pub fn SqlError::message(Self) -> String
```

Every function that can fail raises `SqlError`; the server answers it with
HTTP 400 and the message.

## Values and fragments

```mbti
pub(all) enum SqlValue {
  Text(String)
  Number(Double)
}
pub(all) struct Fragment {
  sql : String
  values : Array[SqlValue]
}
pub impl ToJson for SqlValue
pub impl ToJson for Fragment
```

A `Fragment` is SQL with `?` placeholders and their values in order. Its
JSON form is `{"sql": …, "values": [ … ]}` with strings and numbers.

## Compiling a query tree

```mbti
pub fn compile_ast(@query.Group) -> Fragment raise SqlError
```

Each term becomes one condition; children are wrapped in parentheses and
joined with `AND` or `OR`, negation wraps a part in `NOT (…)`, and an empty
group is `1 = 1`.

| Field | Condition | Accepted operators |
| --- | --- | --- |
| `text` | FTS5 `MATCH` over all columns, value through `compile_fts_value` | `:` |
| `owner`, `package`, `keyword`, `description` | FTS5 `MATCH` on the column, value through `compile_literal_field_value` | `:` |
| `license`, `repository` | `LOWER(COALESCE(p.<field>, '')) LIKE LOWER(?)` with `%value%` | `:`, `=` |
| `rank`, `momentum` | `s.rank_label = ?` / `s.momentum_label = ?` with the canonical label | `=` |
| `score` | `s.score <op> ?`, any finite number | `=`, `>=`, `<=` |
| `dependents`, `recent_dependents`, `external_dependents`, `owners`, `downloads`, `age`, `position` | `p.dependent_count`, `p.recent_dependent_count`, `p.external_dependent_count`, `p.dependent_owner_count`, `p.download_count`, `p.days_since_release`, `s.rank_position` `<op> ?`, an integer | `=`, `>=`, `<=` |
| `year` | the first four characters of `p.latest_created_at` as an integer | `=`, `>=`, `<=` |
| `has_repository`, `has_license` | the column is (not) blank | `=` with `true` or `false` |

```moonbit
test "compile_ast" {
  let ast = @query.parse_expression("keyword:json AND NOT rank=d AND score>=180")
  let fragment = @query_sql.compile_ast(ast)
  inspect(
    fragment.sql,
    content="(EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) AND (NOT (s.rank_label = ?)) AND (s.score >= ?)",
  )
  inspect(
    fragment.to_json().stringify(),
    content=(
      #|{"sql":"(EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) AND (NOT (s.rank_label = ?)) AND (s.score >= ?)","values":["keywords : json*","D",180]}
    ),
  )
}
```

Errors name the field: ``Field `text` only supports text match``,
`rank only supports =`, `rank must be one of S, A, B, C, D`, `rank is empty`,
`score must be a valid number`, `dependents must be an integer`,
`score is empty`, `score does not support text match`,
`has_license must be either true or false`.

## Full-text helpers

```mbti
pub fn compile_fts_expression(String) -> String raise SqlError
pub fn compile_field_expression(String, String) -> String raise SqlError
pub fn compile_fts_value(String) -> String raise SqlError
pub fn compile_literal_field_value(String, String) -> String raise SqlError
pub fn normalize_fts_text(String) -> String
pub fn map_field_alias(String) -> String?
pub fn escape_like_pattern(String) -> String
pub fn build_fts_query(q~ : String, owner~ : String, package_name~ : String, keyword~ : String, description~ : String) -> String? raise SqlError
```

- `compile_fts_expression` compiles the `q` syntax: words, `"phrases"`,
  `field:value` with the aliases of `map_field_alias` (`name`, `author`,
  `pkg`, `tag`, `desc`, …), `AND`, `OR`, `NOT` and parentheses. It checks
  the structure first, so FTS5 never sees a syntax error. `foo bar` without
  an operator is an error.
- `compile_fts_value` turns one operand into a prefix query (`json*`) or a
  phrase (`"moonbit-community json5"`); `compile_literal_field_value` does
  the same for a single-column value, where quotes are not special.
- `normalize_fts_text` keeps ASCII letters, digits and `_ . - * #` and
  collapses everything else to single spaces.
- `compile_field_expression(column, value)` is `column : <value>`.
- `build_fts_query` joins the free-text parameters with `AND`.
- `escape_like_pattern` escapes `\`, `%` and `_` for `LIKE … ESCAPE '\'`.

```moonbit
test "compile_fts_expression" {
  inspect(
    @query_sql.compile_fts_expression("author:gmlewis AND \"http client\""),
    content=(
      #|owner : gmlewis* AND "http client"
    ),
  )
}
```

## Parameters and ordering

```mbti
pub fn parse_number(String, String, integer? : Bool) -> Double? raise SqlError
pub fn parse_boolean(String, String) -> Bool? raise SqlError
pub fn normalize_rank_labels(String) -> Array[String] raise SqlError
pub fn normalize_momentum_labels(String) -> Array[String] raise SqlError
pub fn resolve_order_by(String, String, Bool) -> String raise SqlError
```

`parse_number(value, label)` gives `None` for `""` and otherwise the value
read by `@query.number_value`, which must be finite (and whole with
`integer=true`). `parse_boolean` accepts `""`, `true` and `false`. The label
functions parse comma-separated lists. `resolve_order_by(sort, order,
has_fts)` returns the `ORDER BY` clause:

| Sort | Clause (descending shown) |
| --- | --- |
| `relevance` | `bm25(search_index) ASC, s.rank_position ASC, p.full_name ASC` with an FTS5 match, else `s.rank_position ASC, p.full_name ASC`; `order` is ignored |
| `score`, `growth`, `downloads`, `dependents`, `recent`, `external`, `owners`, `age` | `s.score`, `s.score_growth_30d`, `p.download_count`, `p.dependent_count`, `p.recent_dependent_count`, `p.external_dependent_count`, `p.dependent_owner_count`, `p.days_since_release` `DESC`, then `s.rank_position ASC, p.full_name ASC` |
| `updated` | `COALESCE(p.latest_created_at, '') DESC, s.rank_position ASC, p.full_name ASC` |
| `name` | `p.full_name DESC` |
| `position` | `s.rank_position DESC, p.full_name ASC` |

`order` flips the key only; ties are always broken by rank position (best
first) and then by name (ascending).

A blank `sort` is `relevance` with an FTS5 match and `position` without; a
blank `order` is the key's default (ascending for `relevance`, `name`,
`position`, `age`). Errors: `order must be either asc or desc`,
`sort must be one of relevance, score, …, age`.

## Planning a search

```mbti
pub(all) struct SearchPlan {
  from : String
  where_clause : Fragment
  order_by : String
  limit : Int
  offset : Int
}
pub impl ToJson for SearchPlan
pub fn plan_search(Map[String, String]) -> SearchPlan raise SqlError
```

`plan_search` takes the URL parameters of `/api/search` and validates all
of them (numbers, ranges such as `min_score <= max_score` and years between
1970 and 9999, labels, sort and order). Then:

1. if `ast` or `expr` holds a query with intent, the `WHERE` clause is
   `compile_ast` of it and the order is resolved without FTS5;
2. otherwise the flat parameters are joined with `AND`: the text ones as one
   FTS5 `MATCH` (which also joins `search_index` into `from` for `bm25`),
   the others as conditions; `rank` and `momentum` lists become `IN (…)`;
3. without any criterion the `WHERE` clause is `1 = 1`, so the plan lists
   every package, by `position` unless a sort is given.

`limit` and `offset` come from `@query.page_limit` and `@query.page_offset`.
The JSON form, used by `lib/data.ts`, is
`{"from", "where", "values", "orderBy", "limit", "offset"}`.

```moonbit
test "plan_search" {
  let plan = @query_sql.plan_search({ "rank": "S,A", "min_owners": "2", "limit": "10" })
  inspect(
    plan.where_clause.sql,
    content="1 = 1 AND s.rank_label IN (?, ?) AND p.dependent_owner_count >= ?",
  )
  inspect(plan.order_by, content="s.rank_position ASC, p.full_name ASC")
  inspect(plan.limit, content="10")
}
```

## JavaScript boundary

The ES module from `moon build src/query_sql --target js` exports
`compile_ast_json(ast_json)` and `plan_search_json(params_json)`, which
return `{"ok": …}` or `{"error": "<message>"}` envelopes.
`searchPackagesFromInput` in [`lib/data.ts`](../../../lib/data.ts) calls
`plan_search_json`, runs the `SELECT` and a `COUNT(*)` with the same
`WHERE`, and returns `{ items, total }`.
