///|
fn derived(params : Map[String, String]) -> String {
  let ast = @query.derive_ast(params) catch {
    error => return "error: " + error.message()
  }
  @query.serialize(ast)
}

///|
test "flat parameters become an and group in a fixed order" {
  inspect(
    derived({
      "hasLicense": "true",
      "q": " json ",
      "minScore": "100",
      "maxAge": "30",
      "rank": "A",
      "toYear": "2025",
      "minOwners": "2",
      "minExternalDependents": "1",
      "packageName": "",
      "unrelated": "x",
    }),
    content=(
      #|json AND rank=A AND score>=100 AND year<=2025 AND external_dependents>=1 AND owners>=2 AND age<=30 AND has_license=true
    ),
  )
}

///|
test "rank and momentum lists become or groups" {
  inspect(
    derived({ "rank": "S,a", "momentum": "rising" }),
    content=(
      #|(rank=S OR rank=A) AND momentum=Rising
    ),
  )
  inspect(
    derived({ "rank": " , ", "momentum": "New, Cooling" }),
    content=(
      #|(momentum=New OR momentum=Cooling)
    ),
  )
  inspect(
    derived({ "rank": "S,Z" }),
    content=(
      #|error: rank must be one of S, A, B, C, D
    ),
  )
  inspect(
    derived({ "momentum": "Hot" }),
    content=(
      #|error: momentum must be one of New, Rising, Stable, Cooling
    ),
  )
  inspect(
    derived({ "expr": "rank=x", "rank": "Z" }),
    content=(
      #|rank=x
    ),
  )
}

///|
test "presence flags keep their value untrimmed" {
  let ast = @query.legacy_params_to_ast({ "hasRepository": " true" })
  guard ast.children is [Term(term)] else { fail("expected one term") }
  inspect(
    term.value,
    content=(
      #| true
    ),
  )
}

///|
test "ast wins over expr, which wins over flat parameters" {
  let ast = @query.encode(@query.parse_expression("owner:alice"))
  inspect(
    derived({ "ast": ast, "expr": "owner:bob", "q": "carol" }),
    content=(
      #|owner:alice
    ),
  )
  inspect(
    derived({ "ast": "  ", "expr": "owner:bob", "q": "carol" }),
    content=(
      #|owner:bob
    ),
  )
  inspect(
    derived({ "expr": " ", "q": "carol" }),
    content=(
      #|carol
    ),
  )
  inspect(
    derived({ "expr": "owner:" }),
    content=(
      #|error: Missing query value
    ),
  )
  inspect(
    derived({}),
    content=(
      #|()
    ),
  )
}

///|
test "decode_from_params returns None without ast or expr" {
  debug_inspect(
    @query.decode_from_params({ "q": "x" }),
    content=(
      #|None
    ),
  )
}

///|
test "with_query_ast_patch clears every flat parameter" {
  let patch = @query.with_query_ast_patch(@query.parse_expression("json"))
  for param in @query.legacy_params() {
    assert_eq(patch.get(param.key), Some(""))
  }
  inspect(
    patch.get("expr").unwrap(),
    content=(
      #|json
    ),
  )
  inspect(
    patch.length(),
    content=(
      #|23
    ),
  )
}
