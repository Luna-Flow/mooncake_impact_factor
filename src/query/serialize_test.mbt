///|
fn expr(input : String) -> String {
  let ast = @query.parse_expression(input) catch {
    error => return "error: " + error.message()
  }
  @query.serialize(ast)
}

///|
test "serialize writes the native syntax" {
  inspect(
    expr("(owner:gmlewis OR keyword:json) AND score>=180"),
    content=(
      #|(owner:gmlewis OR keyword:json) AND score>=180
    ),
  )
  inspect(
    expr("json"),
    content=(
      #|json
    ),
  )
  inspect(
    expr("text=json AND year<=2025 AND rank=A"),
    content=(
      #|text=json AND year<=2025 AND rank=A
    ),
  )
  inspect(
    @query.serialize(@query.empty_ast()),
    content=(
      #|()
    ),
  )
}

///|
test "serialize quotes values that are not bare" {
  inspect(
    expr("description:\"json parser\""),
    content=(
      #|description:"json parser"
    ),
  )
  inspect(
    expr("\"a \\\"b\\\" \\\\c\""),
    content=(
      #|"a \"b\" \\c"
    ),
  )
  inspect(
    expr("\"  padded  \""),
    content=(
      #|padded
    ),
  )
  inspect(
    expr("\"\""),
    content=(
      #|""
    ),
  )
  inspect(
    expr("repository:\"https://example.com/x\""),
    content=(
      #|repository:"https://example.com/x"
    ),
  )
  inspect(
    expr("owner:\"and\" OR \"NOT\""),
    content=(
      #|owner:"and" OR "NOT"
    ),
  )
}

///|
test "negated groups keep their parentheses" {
  inspect(
    expr("NOT (a OR b)"),
    content=(
      #|NOT (a OR b)
    ),
  )
  inspect(
    expr("NOT (a AND b) AND c"),
    content=(
      #|NOT (a AND b) AND c
    ),
  )
  inspect(
    expr("NOT (a AND b) OR c"),
    content=(
      #|NOT (a AND b) OR c
    ),
  )
  inspect(
    expr("NOT rank=D OR json"),
    content=(
      #|NOT rank=D OR json
    ),
  )
  inspect(
    expr("NOT (NOT a)"),
    content=(
      #|a
    ),
  )
  let nested = @query.Group::make(And, [
    @query.group(
      And,
      [
        @query.group(And, [
          @query.term(Text, Match, "a"),
          @query.term(Text, Match, "b"),
        ]),
      ],
      negated=true,
    ),
  ])
  inspect(
    @query.serialize(nested),
    content=(
      #|NOT (a AND b)
    ),
  )
}

///|
test "empty groups are written as ()" {
  let ast = @query.Group::make(And, [
    @query.group(And, []),
    @query.term(Owner, Match, "x"),
  ])
  inspect(
    @query.serialize(ast),
    content=(
      #|() AND owner:x
    ),
  )
}

///|
/// parse ∘ serialize is the identity on parser output once nested groups of
/// the same connective have been flattened by one round trip.
test "parse and serialize round trip" {
  let inputs = [
    "(owner:gmlewis OR keyword:json) AND score>=180", "NOT rank=D OR json", "NOT (rank=D OR csv) OR json",
    "json OR parser OR csv", "json AND NOT rank=D", "a AND (b OR (c AND NOT (d OR e)))",
    "(a AND b) AND c", "NOT (a AND b) AND c", "repository:\"https://x.y/z\" AND description:\"a \\\"q\\\"\"",
    "owner:\"and\" OR text:\"OR\"", "momentum=rising AND has_repository=true AND age<=30",
    "NOT NOT NOT (a OR b)", "\"🐫\" OR position<=10",
  ]
  for input in inputs {
    let first = @query.parse_expression(input)
    let once = @query.serialize(first)
    let second = @query.parse_expression(once)
    let twice = @query.serialize(second)
    assert_eq(once, twice)
    assert_eq(@query.parse_expression(twice), second)
  }
}
