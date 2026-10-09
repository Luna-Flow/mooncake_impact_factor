# query API

## Purpose

The package `Luna-Flow/mooncake-impact-factor/query` defines the search
query language of the web application: the query tree (AST), its JSON form,
the native expression syntax with its parser and serializer, the derivation
of a tree from the flat search parameters of the web interface, the label
sets, the sort keys and the paging rules. The database search
([`query_sql`](query_sql.md)) and the static search
([`static_search`](static_search.md)) both start from it, so a query means
the same in both modes.

The package is pure MoonBit and builds for every target. Its results do not
depend on the backend: white space, number syntax and case folding follow
fixed tables instead of host functions.

Source: [`src/query`](../../../src/query/ast.mbt). The grammar and the
reasoning behind it are in the [query design](../design/query.md).

## Importing

```moonbit nocheck
import {
  "Luna-Flow/mooncake-impact-factor/query",
}
```

The examples call the package as `@query`.

## The query tree

A query is a tree whose root is always a group.

### `GroupOp`

```mbti
pub(all) enum GroupOp {
  And
  Or
}
pub fn GroupOp::name(Self) -> String
pub fn GroupOp::from_name(String) -> Self?
```

The connective of a group. An `And` group holds when every child holds (an
empty one always holds); an `Or` group holds when at least one child holds
(an empty one never holds). `name` gives `"and"` or `"or"`, as in the JSON
form; `from_name` accepts exactly those two strings.

### `Field`

```mbti
pub(all) enum Field {
  Text
  Owner
  Package
  Keyword
  Description
  License
  Repository
  Rank
  Momentum
  Score
  Dependents
  RecentDependents
  ExternalDependents
  Owners
  Downloads
  Year
  Age
  Position
  HasRepository
  HasLicense
}
pub fn Field::all() -> Array[Self]
pub fn Field::name(Self) -> String
pub fn Field::from_name(String) -> Self?
```

The attribute a term tests. `name` is the spelling in expressions and JSON;
`from_name` is its case-sensitive inverse; `all` lists the fields in the
order above.

| Field | Name | Kind | Meaning |
| --- | --- | --- | --- |
| `Text` | `text` | text | Full name, owner, package name, description and keywords. |
| `Owner` | `owner` | text | Namespace owner. |
| `Package` | `package` | text | Package name without the owner. |
| `Keyword` | `keyword` | text | One of the keywords. |
| `Description` | `description` | text | Description. |
| `License` | `license` | text | License string. |
| `Repository` | `repository` | text | Repository URL. |
| `Rank` | `rank` | label | Rank label, see `rank_labels`. |
| `Momentum` | `momentum` | label | Momentum label, see `momentum_labels`. |
| `Score` | `score` | number | Impact score. |
| `Dependents` | `dependents` | integer | Dependent packages. |
| `RecentDependents` | `recent_dependents` | integer | Dependents first seen in the recent window. |
| `ExternalDependents` | `external_dependents` | integer | Dependents published by other owners. |
| `Owners` | `owners` | integer | Distinct other owners that depend on the package. |
| `Downloads` | `downloads` | integer | Download count. |
| `Year` | `year` | integer | Year of the latest release. |
| `Age` | `age` | integer | Days since the latest release. |
| `Position` | `position` | integer | Rank position, `1` being the best package. |
| `HasRepository` | `has_repository` | flag | Whether a repository URL is set (`true` or `false`). |
| `HasLicense` | `has_license` | flag | Whether a license is set. |

### `Operator`

```mbti
pub(all) enum Operator {
  Match
  Eq
  Gte
  Lte
}
pub fn Operator::name(Self) -> String
pub fn Operator::from_name(String) -> Self?
pub fn Operator::symbol(Self) -> String
```

The comparison of a term. `name` gives the JSON spelling (`match`, `eq`,
`gte`, `lte`), `symbol` the expression spelling (`:`, `=`, `>=`, `<=`), and
`from_name` reads a JSON spelling.

### `Term`, `Group`, `Node`

```mbti
pub(all) struct Term {
  field : Field
  operator : Operator
  value : String
  negated : Bool
}
pub fn Term::make(Field, Operator, String, negated? : Bool) -> Self

pub(all) struct Group {
  op : GroupOp
  children : Array[Node]
  negated : Bool
}
pub fn Group::make(GroupOp, Array[Node], negated? : Bool) -> Self
pub fn Group::has_intent(Self) -> Bool

pub(all) enum Node {
  Term(Term)
  Group(Group)
}
pub fn Node::has_intent(Self) -> Bool
pub fn Node::negated(Self) -> Bool
pub fn Node::toggle_negation(Self) -> Self

pub fn term(Field, Operator, String, negated? : Bool) -> Node
pub fn group(GroupOp, Array[Node], negated? : Bool) -> Node
pub fn empty_ast() -> Group
```

A `Term` keeps its `value` as typed; numeric fields read it with
`number_value` when they are evaluated. `negated` defaults to `false` in
`Term::make`, `Group::make`, `term` and `group`; `term` and `group` wrap the
result in a `Node`. `empty_ast()` is the empty `And` group.

`has_intent` tells whether a tree asks for anything: a term has intent when
its value is not blank (after `trim`), a group when one of its children has.
A query without intent lists everything. `Node::negated` reads the flag and
`toggle_negation` flips it.

```moonbit
test "building a tree" {
  let ast = @query.Group::make(And, [
    @query.term(Keyword, Match, "json"),
    @query.term(Rank, Eq, "D", negated=true),
  ])
  inspect(@query.serialize(ast), content="keyword:json AND NOT rank=D")
  inspect(ast.has_intent(), content="true")
  inspect(@query.empty_ast().has_intent(), content="false")
}
```

### `QueryError`

```mbti
pub suberror QueryError {
  QueryError(String)
}
pub fn QueryError::message(Self) -> String
```

Raised by the parser, the validator and the label checks. The message is the
text shown to users.

## Expressions

### `parse_expression`

```mbti
pub fn parse_expression(String) -> Group raise QueryError
```

Parses the native expression language. `NOT` binds tighter than `AND`, which
binds tighter than `OR`; parentheses group. A bare word or a quoted string
is a `text` match; `field:value`, `field=value`, `field>=value` and
`field<=value` are terms. Keywords are case-insensitive, field names are
not. A blank expression gives `empty_ast()`; a single term is wrapped in an
`And` group.

```moonbit
test "parse_expression" {
  let ast = @query.parse_expression(
    "(owner:gmlewis OR keyword:json) AND score>=180",
  )
  inspect(ast.op.name(), content="and")
  inspect(ast.children.length(), content="2")
  let error = @query.parse_expression("owner:").op.name() catch {
    error => error.message()
  }
  inspect(error, content="Missing query value")
}
```

The errors are `Unexpected end of query expression`, `Expected rparen`,
`Unexpected trailing query tokens`, `Invalid query term`,
`Missing query value`, `Invalid query value`,
``Unsupported query field `<name>` `` and `Unclosed quoted string`.

### `serialize`

```mbti
pub fn serialize(Group) -> String
```

Writes a tree as an expression. Values are trimmed and quoted unless they
consist of `[A-Za-z0-9_./-]` only and are not a keyword; a group is
parenthesised when its connective differs from its parent's or when it is
negated. For every tree the parser produces, parsing the result gives a tree
that evaluates the same. An empty group has no spelling and is written `()`.

```moonbit
test "serialize" {
  let ast = @query.parse_expression("NOT (rank=D OR repository:\"https://x.y\")")
  inspect(
    @query.serialize(ast),
    content=(
      #|NOT (rank=D OR repository:"https://x.y")
    ),
  )
}
```

## JSON form

```mbti
pub impl ToJson for Term
pub impl ToJson for Group
pub impl ToJson for Node
pub fn validate(Json) -> Group raise QueryError
pub fn encode(Group) -> String
pub fn decode(String) -> Group raise QueryError
```

The JSON form is the one the web interface stores in the `ast` URL
parameter:

```json
{"kind":"group","op":"and","children":[
  {"kind":"term","field":"keyword","operator":"match","value":"json"},
  {"kind":"term","field":"rank","operator":"eq","value":"D","negated":true}]}
```

`negated` is written only when it is `true` and read only when it is
`true`; other keys are ignored. `validate` checks a JSON value and converts
it, `encode` writes the JSON text and `decode` parses and validates JSON
text. The validation messages are `Query AST must be an object`,
`Query AST root must be a group`, `Query group operator must be and or or`,
`Query group children must be an array`, `Query node must be an object`,
`Unknown query node kind`, ``Unsupported query field `<name>` ``,
``Unsupported query operator `<name>` ``, `Query term value must be a string`
and, for `decode`, `Query AST is not valid JSON: <detail>`.

```moonbit
test "encode and decode" {
  let ast = @query.parse_expression("json AND NOT rank=D")
  let text = @query.encode(ast)
  inspect(
    text,
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"json"},{"kind":"term","field":"rank","operator":"eq","value":"D","negated":true}]}
    ),
  )
  assert_eq(@query.decode(text), ast)
}
```

## Flat search parameters

The web interface also has one parameter per field (`q`, `owner`,
`minScore`, …), called the legacy form because it predates the language.

### `LegacyParam`, `legacy_params`

```mbti
pub(all) struct LegacyParam {
  key : String
  field : Field
  operator : Operator
  trimmed : Bool
}
pub fn legacy_params() -> Array[LegacyParam]
```

The table of flat parameters, in the order their terms are added:

| Key | Term |
| --- | --- |
| `q` | `text:` |
| `owner`, `packageName`, `keyword`, `description`, `license`, `repository` | `owner:`, `package:`, `keyword:`, `description:`, `license:`, `repository:` |
| `rank`, `momentum` | `rank=`, `momentum=` (comma-separated lists allowed) |
| `minScore`, `maxScore` | `score>=`, `score<=` |
| `minDependents`, `minRecentDependents`, `minDownloads` | `dependents>=`, `recent_dependents>=`, `downloads>=` |
| `fromYear`, `toYear` | `year>=`, `year<=` |
| `minExternalDependents`, `minOwners`, `maxAge` | `external_dependents>=`, `owners>=`, `age<=` |
| `hasRepository`, `hasLicense` | `has_repository=`, `has_license=` (value not trimmed) |

### `legacy_params_to_ast`, `decode_from_params`, `derive_ast`

```mbti
pub fn legacy_params_to_ast(Map[String, String]) -> Group raise QueryError
pub fn decode_from_params(Map[String, String]) -> Group? raise QueryError
pub fn derive_ast(Map[String, String]) -> Group raise QueryError
```

`legacy_params_to_ast` builds an `And` group of one entry per non-blank
parameter. A `rank` or `momentum` list becomes one term for one label and an
`Or` group of terms for several; labels are canonicalised and an unknown one
raises `QueryError`. `decode_from_params` reads the `ast` parameter (when
not blank) or else the `expr` parameter; `derive_ast` uses it and falls back
to the flat parameters. Missing keys count as blank.

```moonbit
test "derive_ast" {
  let ast = @query.derive_ast({ "q": " json ", "rank": "s,a", "minScore": "100" })
  inspect(
    @query.serialize(ast),
    content="json AND (rank=S OR rank=A) AND score>=100",
  )
  let expr = @query.derive_ast({ "expr": "owner:alice", "q": "ignored" })
  inspect(@query.serialize(expr), content="owner:alice")
}
```

### `with_query_ast_patch`

```mbti
pub fn with_query_ast_patch(Group) -> Map[String, String]
```

The parameter changes that make a tree the active query: every flat
parameter set to `""`, `ast` to `encode(ast)` and `expr` to `serialize(ast)`.

## Labels

```mbti
pub fn rank_labels() -> Array[String]
pub fn momentum_labels() -> Array[String]
pub fn canonical_rank_label(String) -> String?
pub fn canonical_momentum_label(String) -> String?
pub fn parse_label(Field, String) -> String raise QueryError
pub fn parse_rank_list(String) -> Array[String] raise QueryError
pub fn parse_momentum_list(String) -> Array[String] raise QueryError
```

`rank_labels()` is `["S", "A", "B", "C", "D"]` and `momentum_labels()` is
`["New", "Rising", "Stable", "Cooling"]`. They are the only lists of these
values in the query, SQL and static search code. The `canonical_*` functions
match ignoring ASCII case; `parse_label` does the same for the `Rank` and
`Momentum` fields and raises `rank must be one of S, A, B, C, D` (or the
momentum equivalent) otherwise. The list parsers split on commas, trim each
item, drop blanks and repeats, and raise the same error for an unknown item.

```moonbit
test "labels" {
  debug_inspect(@query.parse_momentum_list("rising, New,rising"), content=(
    #|["Rising", "New"]
  ))
  debug_inspect(@query.canonical_rank_label("a"), content=(
    #|Some("A")
  ))
}
```

## Sorting and paging

```mbti
pub(all) enum SortKey {
  Relevance
  Score
  Growth
  Downloads
  Dependents
  Recent
  Updated
  Name
  External
  Owners
  Position
  Age
}
pub fn SortKey::all() -> Array[Self]
pub fn SortKey::name(Self) -> String
pub fn SortKey::from_name(String) -> Self?
pub fn SortKey::ascending_by_default(Self) -> Bool
pub fn default_sort(Bool) -> SortKey
pub let default_page_limit : Int
pub let max_page_limit : Int
pub fn page_limit(String) -> Int
pub fn page_offset(String) -> Int
```

The sort keys of the `sort` parameter, named `relevance`, `score`, `growth`,
`downloads`, `dependents`, `recent`, `updated`, `name`, `external`,
`owners`, `position` and `age`. `relevance`, `name`, `position` and `age`
sort ascending by default, the others descending. `default_sort(true)` is
`Relevance` (a text query is present), `default_sort(false)` is `Position`.

`page_limit` reads the `limit` parameter: a finite number above zero,
truncated and capped at `max_page_limit` (`200`), else `default_page_limit`
(`50`). `page_offset` reads `offset`: a finite number of at least zero,
truncated, else `0`.

```moonbit
test "paging" {
  inspect(@query.page_limit(""), content="50")
  inspect(@query.page_limit("500"), content="200")
  inspect(@query.page_offset("40.9"), content="40")
}
```

## Text helpers

```mbti
pub fn is_white_space(Int) -> Bool
pub fn trim(String) -> String
pub fn number_value(String) -> Double
```

`is_white_space` tests a UTF-16 code unit against the white space of
ECMAScript (`\s`), `trim` removes it from both ends, and `number_value` reads
a value the way ECMAScript `Number(text)` does: blank is `0`, `0x`, `0o` and
`0b` prefixes are allowed, `Infinity` is infinite, anything else that is not
a decimal literal is NaN. They are implemented in MoonBit, so every backend
gives the same results as the TypeScript code they replace.

```moonbit
test "number_value" {
  inspect(@query.number_value(" 12 "), content="12")
  inspect(@query.number_value("0x10"), content="16")
  inspect(@query.number_value("1_000").is_nan(), content="true")
}
```

## JavaScript boundary

`moon build src/query --target js` writes an ES module that exports the
functions below. They take and return strings; a call that can fail
returns `{"ok":<result>}` or `{"error":"<message>"}`.
[`lib/query.ts`](../../../lib/query.ts) wraps them with the TypeScript types
of the web application.

| Export | Result |
| --- | --- |
| `parse_expression_json(expr)` | envelope of the tree |
| `serialize_json(ast_json)` | envelope of the expression |
| `validate_json(json)` | envelope of the normalised tree |
| `derive_ast_json(params_json)` | envelope of `derive_ast` |
| `decode_from_params_json(params_json)` | envelope of the tree or `null` |
| `with_query_ast_patch_json(ast_json)` | envelope of the parameter patch |
| `has_intent_json(ast_json)` | boolean, `false` for invalid input |
| `empty_ast_json()` | JSON of the empty tree |
| `rank_labels_json()`, `momentum_labels_json()` | JSON arrays |

`params_from_json(Json) -> Map[String, String]`, also public, keeps the
string members of a JSON object; the boundary functions use it to read
parameters.
