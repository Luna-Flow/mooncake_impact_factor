# query_sql tutorial

This tutorial shows you how the dynamic site turns a search request into
SQL, and how to use the `query_sql` package to compile queries yourself. The
[query_sql design](../design/query_sql.md) explains the two compilation
paths; the [query_sql API](../api/query_sql.md) lists every function.

| I want to | Use |
| --- | --- |
| search the running site | `GET /api/search?...` (see [getting started](../getting_started.md#3-query-the-apis)) |
| compile a query tree to a `WHERE` clause | `@query_sql.compile_ast(ast)` |
| compile the free-text `q` syntax | `@query_sql.compile_fts_expression(q)` |
| plan a whole request | `@query_sql.plan_search(params)` |

## Quick start

Import both packages:

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
  "Luna-Flow/mooncake-impact-factor/query_sql",
}
```

Compile an expression:

```moonbit
test "quick start" {
  let ast = @query.parse_expression("owner:gmlewis AND downloads>=500")
  let fragment = @query_sql.compile_ast(ast)
  println(fragment.sql)
  debug_inspect(fragment.values, content=(
    #|[Text("owner : gmlewis*"), Number(500)]
  ))
}
```

`fragment.sql` has one `?` per value. Put it after `WHERE` in a query over
`packages p JOIN package_scores s ON s.package_id = p.id` and bind the
values in order.

## Everyday tasks

### Plan a request like the server

`plan_search` takes the URL parameters of `/api/search` and returns all
parts of the statement:

```moonbit
test "plan a request" {
  let plan = @query_sql.plan_search({
    "q": "json",
    "momentum": "rising,new",
    "limit": "20",
    "offset": "40",
  })
  let sql = "SELECT p.full_name FROM \{plan.from} WHERE \{plan.where_clause.sql} ORDER BY \{plan.order_by} LIMIT ? OFFSET ?"
  println(sql)
  inspect(
    plan.order_by,
    content="bm25(search_index) ASC, s.rank_position ASC, p.full_name ASC",
  )
  inspect(plan.limit, content="20")
  inspect(plan.offset, content="40")
}
```

`lib/data.ts` does exactly this and runs a second statement,
`SELECT COUNT(*) FROM <from> WHERE <where>`, for the total.

### Turn errors into messages

Every problem is a `SqlError` with a message meant for the user:

```moonbit
test "errors" {
  fn plan_error(params : Map[String, String]) -> String {
    let _ = @query_sql.plan_search(params) catch {
      error => return error.message()
    }
    "ok"
  }

  inspect(plan_error({ "q": "json AND" }), content="Search query cannot end with a boolean operator")
  inspect(plan_error({ "rank": "S,X" }), content="rank must be one of S, A, B, C, D")
  inspect(plan_error({ "min_score": "5", "max_score": "4" }), content="min_score cannot be greater than max_score")
}
```

## Pitfalls

- **`q` needs operators.** `json parser` is an error; write
  `json AND parser` or the phrase `"json parser"`.
- **Text terms are prefix matches**, not substrings: `json` finds `json5`
  but not `fastjson`. The static site uses substrings.
- **Columns of scoring v2.** `external_dependents`, `owners`, `age` and
  `position` need the `external_dependent_count`, `dependent_owner_count`,
  `days_since_release` and `rank_position` columns written by the index
  builder.

## Where to read next

- [query tutorial](query.md) for the expression language.
- [query_sql design](../design/query_sql.md) for why the flat parameters
  are not compiled through a query tree.
