///|
/// The parse result as JSON text, or the error message.
fn parsed(input : String) -> String {
  let ast = @query.parse_expression(input) catch {
    error => return "error: " + error.message()
  }
  @query.encode(ast)
}

///|
test "blank expressions give the empty query" {
  inspect(
    parsed(""),
    content=(
      #|{"kind":"group","op":"and","children":[]}
    ),
  )
  inspect(
    parsed(" \t\u{3000}\u{FEFF} "),
    content=(
      #|{"kind":"group","op":"and","children":[]}
    ),
  )
}

///|
test "a single term is wrapped in an and group" {
  inspect(
    parsed("json"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"json"}]}
    ),
  )
  inspect(
    parsed("score>=180"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"score","operator":"gte","value":"180"}]}
    ),
  )
}

///|
test "operators map to term operators" {
  let ast = @query.parse_expression(
    "owner:gmlewis AND rank=A AND score>=1 AND year<=2025",
  )
  debug_inspect(
    ast.children.map(child => {
      match child {
        Term(term) =>
          "\{term.field.name()} \{term.operator.name()} \{term.value}"
        Group(_) => "group"
      }
    }),
    content=(
      #|["owner match gmlewis", "rank eq A", "score gte 1", "year lte 2025"]
    ),
  )
}

///|
test "every field name parses" {
  for field in @query.Field::all() {
    let ast = @query.parse_expression(field.name() + "=1")
    guard ast.children is [Term(term)] else { fail("expected one term") }
    assert_eq(term.field, field)
  }
  inspect(
    parsed("external_dependents>=2 AND owners>=3 AND age<=30 AND position<=10"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"external_dependents","operator":"gte","value":"2"},{"kind":"term","field":"owners","operator":"gte","value":"3"},{"kind":"term","field":"age","operator":"lte","value":"30"},{"kind":"term","field":"position","operator":"lte","value":"10"}]}
    ),
  )
}

///|
test "AND binds tighter than OR" {
  inspect(
    parsed("a OR b AND c"),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"text","operator":"match","value":"a"},{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"b"},{"kind":"term","field":"text","operator":"match","value":"c"}]}]}
    ),
  )
  inspect(
    parsed("a AND b OR c"),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"a"},{"kind":"term","field":"text","operator":"match","value":"b"}]},{"kind":"term","field":"text","operator":"match","value":"c"}]}
    ),
  )
}

///|
test "parentheses group and a single parenthesised term is unwrapped" {
  inspect(
    parsed("(owner:gmlewis OR keyword:json) AND score>=180"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"group","op":"or","children":[{"kind":"term","field":"owner","operator":"match","value":"gmlewis"},{"kind":"term","field":"keyword","operator":"match","value":"json"}]},{"kind":"term","field":"score","operator":"gte","value":"180"}]}
    ),
  )
  inspect(
    parsed("(json)"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"json"}]}
    ),
  )
  inspect(
    parsed("(a AND b) AND c"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"a"},{"kind":"term","field":"text","operator":"match","value":"b"}]},{"kind":"term","field":"text","operator":"match","value":"c"}]}
    ),
  )
}

///|
test "NOT negates terms and groups and NOT NOT cancels" {
  inspect(
    parsed("NOT rank=D"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"rank","operator":"eq","value":"D","negated":true}]}
    ),
  )
  inspect(
    parsed("NOT (a OR b)"),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"text","operator":"match","value":"a"},{"kind":"term","field":"text","operator":"match","value":"b"}],"negated":true}
    ),
  )
  inspect(
    parsed("NOT NOT a"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"a"}]}
    ),
  )
  inspect(
    parsed("NOT a OR b"),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"text","operator":"match","value":"a","negated":true},{"kind":"term","field":"text","operator":"match","value":"b"}]}
    ),
  )
}

///|
test "keywords are case-insensitive, field names are not" {
  inspect(
    parsed("a and not b Or c"),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"a"},{"kind":"term","field":"text","operator":"match","value":"b","negated":true}]},{"kind":"term","field":"text","operator":"match","value":"c"}]}
    ),
  )
  inspect(
    parsed("Owner:x"),
    content=(
      #|error: Unsupported query field `Owner`
    ),
  )
}

///|
test "quoted strings keep spaces and resolve escapes" {
  inspect(
    parsed("description:\"json parser\" OR \"a \\\"b\\\" \\\\c\""),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"description","operator":"match","value":"json parser"},{"kind":"term","field":"text","operator":"match","value":"a \"b\" \\c"}]}
    ),
  )
  inspect(
    parsed("\"\""),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":""}]}
    ),
  )
  inspect(
    parsed("\"🐫 原来\" OR owner:\"AND\""),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"text","operator":"match","value":"🐫 原来"},{"kind":"term","field":"owner","operator":"match","value":"AND"}]}
    ),
  )
}

///|
test "bare words stop at delimiters only" {
  inspect(
    parsed("a>b"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"a>b"}]}
    ),
  )
  inspect(
    parsed("x\"y\""),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"text","operator":"match","value":"x\"y\""}]}
    ),
  )
  inspect(
    parsed("score>=-1.5e2"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"score","operator":"gte","value":"-1.5e2"}]}
    ),
  )
  inspect(
    parsed("score>=1"),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"term","field":"score","operator":"gte","value":"1"}]}
    ),
  )
}

///|
test "parse errors" {
  inspect(
    parsed("("),
    content=(
      #|error: Unexpected end of query expression
    ),
  )
  inspect(
    parsed("(a"),
    content=(
      #|error: Expected rparen
    ),
  )
  inspect(
    parsed("a)"),
    content=(
      #|error: Unexpected trailing query tokens
    ),
  )
  inspect(
    parsed("a b"),
    content=(
      #|error: Unexpected trailing query tokens
    ),
  )
  inspect(
    parsed("AND a"),
    content=(
      #|error: Invalid query term
    ),
  )
  inspect(
    parsed("a AND"),
    content=(
      #|error: Unexpected end of query expression
    ),
  )
  inspect(
    parsed(":a"),
    content=(
      #|error: Invalid query term
    ),
  )
  inspect(
    parsed("owner:"),
    content=(
      #|error: Missing query value
    ),
  )
  inspect(
    parsed("owner:(a)"),
    content=(
      #|error: Invalid query value
    ),
  )
  inspect(
    parsed("color:red"),
    content=(
      #|error: Unsupported query field `color`
    ),
  )
  inspect(
    parsed("\"abc"),
    content=(
      #|error: Unclosed quoted string
    ),
  )
  inspect(
    parsed("\"abc\\"),
    content=(
      #|error: Unclosed quoted string
    ),
  )
  inspect(
    parsed("NOT"),
    content=(
      #|error: Unexpected end of query expression
    ),
  )
  inspect(
    parsed("repository:https://example.com"),
    content=(
      #|error: Unexpected trailing query tokens
    ),
  )
}
