# query tutorial

This tutorial shows you how to write search queries for the web
application, and how to parse, inspect and rewrite them from MoonBit with
the `query` package. The [query design](../design/query.md) explains the
grammar; the [query API](../api/query.md) lists every function.

| I want to | Use |
| --- | --- |
| search the web application | an expression such as `json AND score>=180` in the search box or the advanced dialog |
| parse an expression | `@query.parse_expression(text)` |
| print a query | `@query.serialize(ast)` |
| store or send a query | `@query.encode(ast)`, `@query.decode(text)` |
| turn URL parameters into a query | `@query.derive_ast(params)` |
| check a rank or momentum value | `@query.parse_label`, `@query.parse_rank_list` |

## Writing queries

You do not need MoonBit to use the language: type it in the search box of
the advanced dialog, or pass it as the `expr` URL parameter.

| Query | Finds |
| --- | --- |
| `json` | packages whose name, owner, description or keywords contain `json` |
| `"json parser"` | the phrase, spaces included |
| `owner:gmlewis` | packages of the owner `gmlewis` |
| `keyword:json OR keyword:yaml` | either keyword |
| `json AND NOT rank=D` | `json` packages except rank `D` |
| `(owner:gmlewis OR keyword:json) AND score>=180` | grouping with parentheses |
| `momentum=rising AND age<=30` | rising packages released in the last 30 days |
| `position<=10` | the ten best-ranked packages |
| `external_dependents>=5 AND owners>=3` | packages used outside their owner's namespace |

Three rules cover most surprises:

- `NOT` binds tightest, then `AND`, then `OR`: `NOT a OR b AND c` means
  `(NOT a) OR (b AND c)`. Use parentheses when in doubt.
- Field names are lower case and exact (`owner:`, not `Owner:`); `AND`,
  `OR` and `NOT` can be written in any case.
- Quote values that contain spaces, colons or other punctuation:
  `repository:"https://github.com/x"`.

The fields are listed in the [API](../api/query.md#field). Rank labels are
`S A B C D`, momentum labels `New Rising Stable Cooling`, both matched
ignoring case.

## Quick start in MoonBit

Add the module and import the package:

```bash
moon add Luna-Flow/mooncake-impact-factor@0.2.0
```

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
}
```

Parse an expression and look at the tree:

```moonbit
test "quick start" {
  let ast = @query.parse_expression("json AND NOT rank=D")
  for child in ast.children {
    match child {
      Term(term) =>
        println("\{term.field.name()} \{term.operator.symbol()} \{term.value} negated=\{term.negated}")
      Group(_) => println("group")
    }
  }
  inspect(@query.serialize(ast), content="json AND NOT rank=D")
}
```

It prints `text : json negated=false` and `rank = D negated=true`. The
package builds for every target, so `moon test --target all` runs it on
each backend.

## Everyday tasks

### Report a syntax error

`parse_expression` raises `QueryError` with a message for the user:

```moonbit
test "syntax errors" {
  fn check(text : String) -> String {
    let _ = @query.parse_expression(text) catch {
      error => return error.message()
    }
    "ok"
  }

  inspect(check("(json"), content="Expected rparen")
  inspect(check("colour:red"), content="Unsupported query field `colour`")
  inspect(check("json AND"), content="Unexpected end of query expression")
}
```

### Build a query in code and print it

```moonbit
test "build and print" {
  let ast = @query.Group::make(And, [
    @query.group(Or, [
      @query.term(Owner, Match, "gmlewis"),
      @query.term(Keyword, Match, "json"),
    ]),
    @query.term(Score, Gte, "180"),
  ])
  inspect(
    @query.serialize(ast),
    content="(owner:gmlewis OR keyword:json) AND score>=180",
  )
}
```

### Accept the parameters of the web interface

`derive_ast` turns a map of web interface parameters into a tree: `ast`
first, then `expr`, then the flat fields.

```moonbit
test "parameters" {
  let ast = @query.derive_ast({
    "keyword": "json",
    "momentum": "rising,new",
    "maxAge": "90",
  })
  inspect(
    @query.serialize(ast),
    content="keyword:json AND (momentum=Rising OR momentum=New) AND age<=90",
  )
}
```

An unknown label raises `QueryError("momentum must be one of New, Rising,
Stable, Cooling")`.

### Store a query

`encode` gives the JSON text the web interface puts in the `ast` URL
parameter, and `decode` reads it back, validating it:

```moonbit
test "store" {
  let ast = @query.parse_expression("owners>=2")
  let stored = @query.encode(ast)
  assert_eq(@query.decode(stored), ast)
}
```

## Pitfalls

- **Blank queries match everything.** `has_intent` is false for a tree
  whose values are all blank, and the searches then list every package.
- **Empty groups.** The query builder can create an empty group; it is
  written `()`, which the parser does not accept. Remove empty groups before
  showing the expression to users.
- **Values are not checked per field.** `score>=abc` parses. The database
  search answers it with HTTP 400; the static search matches nothing.

## Where to read next

- [query API](../api/query.md) for every function and the JSON form.
- [query design](../design/query.md) for the grammar and the round-trip
  argument.
- [query_sql tutorial](query_sql.md) and
  [static_search tutorial](static_search.md) for how the two search modes
  answer a query.
