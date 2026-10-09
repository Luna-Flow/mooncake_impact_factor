///|
fn validated(input : String) -> String {
  let ast = @query.decode(input) catch {
    error => return "error: " + error.message()
  }
  @query.encode(ast)
}

///|
test "the JSON form omits negated unless it is true" {
  let ast = @query.Group::make(Or, [
    @query.term(Rank, Eq, "D", negated=true),
    @query.term(Text, Match, "json"),
  ])
  inspect(
    @query.encode(ast),
    content=(
      #|{"kind":"group","op":"or","children":[{"kind":"term","field":"rank","operator":"eq","value":"D","negated":true},{"kind":"term","field":"text","operator":"match","value":"json"}]}
    ),
  )
  inspect(
    @query.encode(@query.Group::make(And, [], negated=true)),
    content=(
      #|{"kind":"group","op":"and","children":[],"negated":true}
    ),
  )
}

///|
test "decode accepts the shape the web interface sends" {
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"negated\":false,\"children\":[{\"kind\":\"group\",\"op\":\"or\",\"children\":[{\"kind\":\"term\",\"field\":\"owner\",\"operator\":\"match\",\"value\":\"alice\"},{\"kind\":\"term\",\"field\":\"keyword\",\"operator\":\"match\",\"value\":\"helper\",\"negated\":true}]},{\"kind\":\"term\",\"field\":\"score\",\"operator\":\"gte\",\"value\":\"80\",\"extra\":1}]}",
    ),
    content=(
      #|{"kind":"group","op":"and","children":[{"kind":"group","op":"or","children":[{"kind":"term","field":"owner","operator":"match","value":"alice"},{"kind":"term","field":"keyword","operator":"match","value":"helper","negated":true}]},{"kind":"term","field":"score","operator":"gte","value":"80"}]}
    ),
  )
}

///|
test "decode round-trips encode" {
  let ast = @query.parse_expression(
    "NOT (owners>=2 OR external_dependents>=1) AND description:\"a \\\"b\\\"\"",
  )
  assert_eq(@query.decode(@query.encode(ast)), ast)
}

///|
test "validation errors" {
  inspect(
    validated("1"),
    content=(
      #|error: Query AST must be an object
    ),
  )
  inspect(
    validated("null"),
    content=(
      #|error: Query AST must be an object
    ),
  )
  inspect(
    validated("[]"),
    content=(
      #|error: Query AST root must be a group
    ),
  )
  inspect(
    validated("{\"kind\":\"term\"}"),
    content=(
      #|error: Query AST root must be a group
    ),
  )
  inspect(
    validated("{\"kind\":\"group\",\"op\":\"xor\",\"children\":[]}"),
    content=(
      #|error: Query group operator must be and or or
    ),
  )
  inspect(
    validated("{\"kind\":\"group\",\"op\":[\"or\"],\"children\":[]}"),
    content=(
      #|{"kind":"group","op":"or","children":[]}
    ),
  )
  inspect(
    validated("{\"kind\":\"group\",\"op\":\"and\"}"),
    content=(
      #|error: Query group children must be an array
    ),
  )
  inspect(
    validated("{\"kind\":\"group\",\"op\":\"and\",\"children\":[1]}"),
    content=(
      #|error: Query node must be an object
    ),
  )
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"children\":[{\"kind\":\"x\"}]}",
    ),
    content=(
      #|error: Unknown query node kind
    ),
  )
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"children\":[{\"kind\":\"term\",\"field\":\"color\",\"operator\":\"eq\",\"value\":\"x\"}]}",
    ),
    content=(
      #|error: Unsupported query field `color`
    ),
  )
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"children\":[{\"kind\":\"term\",\"field\":2,\"operator\":\"eq\",\"value\":\"x\"}]}",
    ),
    content=(
      #|error: Unsupported query field `2`
    ),
  )
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"children\":[{\"kind\":\"term\",\"field\":\"owner\",\"operator\":\"like\",\"value\":\"x\"}]}",
    ),
    content=(
      #|error: Unsupported query operator `like`
    ),
  )
  inspect(
    validated(
      "{\"kind\":\"group\",\"op\":\"and\",\"children\":[{\"kind\":\"term\",\"field\":\"owner\",\"operator\":\"eq\",\"value\":3}]}",
    ),
    content=(
      #|error: Query term value must be a string
    ),
  )
  inspect(
    validated("{"),
    content=(
      #|error: Query AST is not valid JSON: Unexpected end of file
    ),
  )
}

///|
test "has_intent ignores blank values" {
  inspect(@query.empty_ast().has_intent(), content="false")
  let blank = @query.Group::make(And, [
    @query.group(Or, [@query.term(Text, Match, " \u{A0}")]),
  ])
  inspect(blank.has_intent(), content="false")
  let some = @query.Group::make(And, [
    @query.group(Or, [@query.term(Text, Match, " x")]),
  ])
  inspect(some.has_intent(), content="true")
}
