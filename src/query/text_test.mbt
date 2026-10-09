///|
test "trim removes ECMAScript white space only" {
  inspect(
    @query.trim(
      " \t\n\u{B}\u{C}\r\u{A0}\u{1680}\u{2000}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}x y\u{3000}",
    ),
    content=(
      #|x y
    ),
  )
  inspect(
    @query.trim("\u{200B}x\u{85}"),
    content=(
      #|​x
    ),
  )
  inspect(@query.trim(""), content="")
}

///|
test "number_value follows ECMAScript Number()" {
  let inputs = [
    "", " ", "12", " 12 ", "-1.5", "+.5", "5.", ".", "-", "1e3", "1E-2", "1e", "1_000",
    "0x10", "0X1f", "0o17", "0b101", "0x", "-0x10", "Infinity", "-Infinity", "infinity",
    "inf", "1e400", "12abc", "1 2", "007",
  ]
  debug_inspect(
    inputs.map(input => @query.number_value(input).to_string()),
    content=(
      #|[
      #|  "0",
      #|  "0",
      #|  "12",
      #|  "12",
      #|  "-1.5",
      #|  "0.5",
      #|  "5",
      #|  "NaN",
      #|  "NaN",
      #|  "1000",
      #|  "0.01",
      #|  "NaN",
      #|  "NaN",
      #|  "16",
      #|  "31",
      #|  "15",
      #|  "5",
      #|  "NaN",
      #|  "NaN",
      #|  "Infinity",
      #|  "-Infinity",
      #|  "NaN",
      #|  "NaN",
      #|  "Infinity",
      #|  "NaN",
      #|  "NaN",
      #|  "7",
      #|]
    ),
  )
}

///|
test "labels" {
  debug_inspect(
    @query.rank_labels(),
    content=(
      #|["S", "A", "B", "C", "D"]
    ),
  )
  debug_inspect(
    @query.momentum_labels(),
    content=(
      #|["New", "Rising", "Stable", "Cooling"]
    ),
  )
  debug_inspect(
    @query.canonical_rank_label("a"),
    content=(
      #|Some("A")
    ),
  )
  debug_inspect(
    @query.canonical_momentum_label("cOoLiNg"),
    content=(
      #|Some("Cooling")
    ),
  )
  debug_inspect(
    @query.canonical_momentum_label("Hot"),
    content=(
      #|None
    ),
  )
  debug_inspect(
    @query.canonical_momentum_label(" New"),
    content=(
      #|None
    ),
  )
}

///|
test "field and operator names round trip" {
  for field in @query.Field::all() {
    assert_eq(@query.Field::from_name(field.name()), Some(field))
  }
  for operator in [@query.Operator::Match, Eq, Gte, Lte] {
    assert_eq(@query.Operator::from_name(operator.name()), Some(operator))
  }
  debug_inspect(
    @query.Field::all().map(field => field.name()),
    content=(
      #|[
      #|  "text",
      #|  "owner",
      #|  "package",
      #|  "keyword",
      #|  "description",
      #|  "license",
      #|  "repository",
      #|  "rank",
      #|  "momentum",
      #|  "score",
      #|  "dependents",
      #|  "recent_dependents",
      #|  "external_dependents",
      #|  "owners",
      #|  "downloads",
      #|  "year",
      #|  "age",
      #|  "position",
      #|  "has_repository",
      #|  "has_license",
      #|]
    ),
  )
}
