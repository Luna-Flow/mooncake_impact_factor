///|
test "sort keys" {
  debug_inspect(
    @query.SortKey::all().map(key => key.name()),
    content=(
      #|[
      #|  "relevance",
      #|  "score",
      #|  "growth",
      #|  "downloads",
      #|  "dependents",
      #|  "recent",
      #|  "updated",
      #|  "name",
      #|  "external",
      #|  "owners",
      #|  "position",
      #|  "age",
      #|]
    ),
  )
  for key in @query.SortKey::all() {
    assert_eq(@query.SortKey::from_name(key.name()), Some(key))
  }
  debug_inspect(
    @query.SortKey::all()
    .filter(key => key.ascending_by_default())
    .map(key => key.name()),
    content=(
      #|["relevance", "name", "position", "age"]
    ),
  )
  debug_inspect(
    @query.default_sort(true),
    content=(
      #|Relevance
    ),
  )
  debug_inspect(
    @query.default_sort(false),
    content=(
      #|Position
    ),
  )
  debug_inspect(
    @query.SortKey::from_name("Score"),
    content=(
      #|None
    ),
  )
}

///|
test "page limit and offset" {
  debug_inspect(
    [
      "", "abc", "0", "-5", "10", " 10.9 ", "200", "201", "1e9", "Infinity", "0.5",
    ].map(@query.page_limit),
    content=(
      #|[50, 50, 50, 50, 10, 10, 200, 200, 200, 50, 0]
    ),
  )
  debug_inspect(
    ["", "abc", "-1", "0", "40", "40.7", "1e12", "Infinity"].map(
      @query.page_offset,
    ),
    content=(
      #|[0, 0, 0, 0, 40, 40, 2147483647, 0]
    ),
  )
}

///|
test "rank and momentum lists" {
  debug_inspect(
    @query.parse_rank_list(" s, A ,,a"),
    content=(
      #|["S", "A"]
    ),
  )
  debug_inspect(
    @query.parse_momentum_list("Rising,new"),
    content=(
      #|["Rising", "New"]
    ),
  )
  debug_inspect(
    @query.parse_rank_list(""),
    content=(
      #|[]
    ),
  )
  let message = @query.parse_rank_list("S,X").length().to_string() catch {
      error => error.message()
    }
  inspect(message, content="rank must be one of S, A, B, C, D")
  let message = @query.parse_momentum_list("Hot").length().to_string() catch {
      error => error.message()
    }
  inspect(
    message,
    content="momentum must be one of New, Rising, Stable, Cooling",
  )
}
