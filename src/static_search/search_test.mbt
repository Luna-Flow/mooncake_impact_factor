///|
fn item(
  full_name : String,
  rank_label : String,
  text : String,
  score : Double,
  momentum_label? : String = "Stable",
  downloads? : Double = 0.0,
  position? : Double = 0.0,
  created? : String? = Some("2026-01-01T00:00:00Z"),
) -> @static_search.IndexItem {
  let (owner, package_name) = match full_name.split_once("/") {
    Some((a, b)) => (a.to_owned(), b.to_owned())
    None => (full_name, "")
  }
  {
    full_name,
    rank_label,
    momentum_label,
    score,
    score_growth_30d: 0.0,
    download_count: downloads,
    dependent_count: 0.0,
    recent_dependent_count: 0.0,
    external_dependent_count: 0.0,
    dependent_owner_count: 0.0,
    days_since_release: 0.0,
    rank_position: position,
    latest_created_at: created,
    repository_present: false,
    license_present: false,
    normalized_full_text: @static_search.normalize_text(
      "\{full_name} \{owner} \{package_name} \{text}",
    ),
    normalized_owner: owner,
    normalized_package: package_name,
    normalized_description: @static_search.normalize_text(text),
    normalized_license: "",
    normalized_repository: "",
    normalized_keywords: [],
  }
}

///|
let packages : Array[@static_search.IndexItem] = [
  item("dave/jsond", "D", "json parser", 10.0, position=3.0),
  item("alice/json", "A", "json parser", 200.0, position=1.0),
  item("carol/csv", "A", "csv reader", 190.0, position=2.0),
]

///|
fn relevance_of(expression : String) -> Array[(String, Int)] raise {
  let ast = @query.parse_expression(expression)
  packages.map(pkg => (pkg.full_name, @static_search.relevance(pkg, ast)))
}

///|
fn matching(expression : String) -> Array[String] raise {
  let ast = @query.parse_expression(expression)
  packages
  .filter(pkg => @static_search.evaluate(pkg, Group(ast)))
  .map(pkg => pkg.full_name)
}

///|
test "negated leaves under OR add no relevance (issue #4)" {
  debug_inspect(
    relevance_of("NOT rank=D OR json"),
    content=(
      #|[("dave/jsond", 1), ("alice/json", 1), ("carol/csv", 0)]
    ),
  )
}

///|
test "leaves below a negated group add no relevance" {
  debug_inspect(
    relevance_of("NOT (rank=D OR csv) OR json"),
    content=(
      #|[("dave/jsond", 1), ("alice/json", 1), ("carol/csv", 0)]
    ),
  )
  debug_inspect(
    relevance_of("NOT (NOT json)"),
    content=(
      #|[("dave/jsond", 1), ("alice/json", 1), ("carol/csv", 0)]
    ),
  )
}

///|
test "positive leaves are still counted" {
  debug_inspect(
    relevance_of("json OR parser OR csv"),
    content=(
      #|[("dave/jsond", 2), ("alice/json", 2), ("carol/csv", 1)]
    ),
  )
}

///|
test "negation still filters" {
  debug_inspect(
    matching("NOT rank=D OR json"),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("json AND NOT rank=D"),
    content=(
      #|["alice/json"]
    ),
  )
}

///|
test "terms" {
  debug_inspect(
    matching("rank=a"),
    content=(
      #|["alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("rank=\" A \""),
    content=(
      #|["alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("momentum=STABLE"),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("score>=190"),
    content=(
      #|["alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("score>=abc"),
    content=(
      #|[]
    ),
  )
  debug_inspect(
    matching("score:10"),
    content=(
      #|["dave/jsond"]
    ),
  )
  debug_inspect(
    matching("score>=\"\""),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("position<=2"),
    content=(
      #|["alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("year=2026 AND year>=0x7EA"),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("owner:ALI"),
    content=(
      #|["alice/json"]
    ),
  )
  debug_inspect(
    matching("description:\"JSON P\""),
    content=(
      #|["dave/jsond", "alice/json"]
    ),
  )
  debug_inspect(
    matching("text:\"  \""),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("has_repository=false AND has_license=\"no\""),
    content=(
      #|["dave/jsond", "alice/json", "carol/csv"]
    ),
  )
  debug_inspect(
    matching("(a OR b) AND NOT csv"),
    content=(
      #|["dave/jsond", "alice/json"]
    ),
  )
}

///|
test "package_year" {
  debug_inspect(
    [
      item("a/a", "D", "", 0.0, created=None),
      item("a/a", "D", "", 0.0, created=Some("202")),
      item("a/a", "D", "", 0.0, created=Some("20x1-01-01")),
      item("a/a", "D", "", 0.0, created=Some("2025-01-01")),
    ].map(@static_search.package_year),
    content=(
      #|[0, 0, 0, 2025]
    ),
  )
}

///|
fn names(params : Map[String, String]) -> Array[String] {
  let result = @static_search.search_items(packages, params) catch {
    error => return ["error: " + error.message()]
  }
  result.indices.map(index => packages[index].full_name)
}

///|
test "default sort and order" {
  // Without a query: rank position, best first.
  debug_inspect(
    names({}),
    content=(
      #|["alice/json", "carol/csv", "dave/jsond"]
    ),
  )
  // With a query: relevance, then score, then name.
  debug_inspect(
    names({ "q": "json" }),
    content=(
      #|["alice/json", "dave/jsond"]
    ),
  )
  debug_inspect(
    names({ "expr": "json OR parser OR csv" }),
    content=(
      #|["alice/json", "dave/jsond", "carol/csv"]
    ),
  )
  // Relevance ignores order.
  debug_inspect(
    names({ "q": "json", "order": "asc" }),
    content=(
      #|["alice/json", "dave/jsond"]
    ),
  )
  debug_inspect(
    names({ "q": "json", "sort": "relevance", "order": "desc" }),
    content=(
      #|["alice/json", "dave/jsond"]
    ),
  )
}

///|
test "sort keys and tie-breaks" {
  let tied = [
    item("b/x", "A", "", 50.0, downloads=5.0),
    item("A/x", "A", "", 50.0, downloads=5.0),
    item("a/x", "A", "", 60.0, downloads=1.0),
    item("a-b/x", "A", "", 60.0, downloads=1.0),
  ]
  fn sorted(sort : String, order : String) -> Array[String] {
    @static_search.sort_indices(
      tied,
      [0, 1, 2, 3],
      @query.empty_ast(),
      sort~,
      order~,
    ).map(index => tied[index].full_name)
  }

  debug_inspect(
    sorted("score", ""),
    content=(
      #|["a/x", "a-b/x", "b/x", "A/x"]
    ),
  )
  debug_inspect(
    sorted("score", "asc"),
    content=(
      #|["A/x", "b/x", "a-b/x", "a/x"]
    ),
  )
  debug_inspect(
    sorted("downloads", ""),
    content=(
      #|["b/x", "A/x", "a/x", "a-b/x"]
    ),
  )
  debug_inspect(
    sorted("name", ""),
    content=(
      #|["a-b/x", "a/x", "A/x", "b/x"]
    ),
  )
  debug_inspect(
    sorted("name", "desc"),
    content=(
      #|["b/x", "A/x", "a/x", "a-b/x"]
    ),
  )
  debug_inspect(
    sorted("unknown", ""),
    content=(
      #|["a/x", "a-b/x", "b/x", "A/x"]
    ),
  )
  debug_inspect(
    sorted("updated", ""),
    content=(
      #|["b/x", "A/x", "a/x", "a-b/x"]
    ),
  )
}

///|
test "paging" {
  let result = @static_search.search_items(packages, { "limit": "2" })
  debug_inspect(
    result,
    content=(
      #|{ indices: [1, 2], total: 3 }
    ),
  )
  let result = @static_search.search_items(packages, {
    "limit": "2",
    "offset": "2",
  })
  debug_inspect(
    result,
    content=(
      #|{ indices: [0], total: 3 }
    ),
  )
  let result = @static_search.search_items(packages, { "offset": "9" })
  debug_inspect(
    result,
    content=(
      #|{ indices: [], total: 3 }
    ),
  )
}

///|
test "rank and momentum lists" {
  debug_inspect(
    names({ "rank": "a,d" }),
    content=(
      #|["alice/json", "carol/csv", "dave/jsond"]
    ),
  )
  debug_inspect(
    names({ "rank": "S" }),
    content=(
      #|[]
    ),
  )
  debug_inspect(
    names({ "momentum": "Hot" }),
    content=(
      #|["error: momentum must be one of New, Rising, Stable, Cooling"]
    ),
  )
  debug_inspect(
    names({ "expr": "(" }),
    content=(
      #|["error: Unexpected end of query expression"]
    ),
  )
}
