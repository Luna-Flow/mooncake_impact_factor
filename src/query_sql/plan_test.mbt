///|
fn planned(params : Map[String, String]) -> String {
  let plan = @query_sql.plan_search(params) catch {
    error => return "error: " + error.message()
  }
  plan.to_json().stringify(indent=2)
}

///|
fn plan_error(params : Map[String, String]) -> String {
  let _ = @query_sql.plan_search(params) catch {
    error => return error.message()
  }
  "ok"
}

///|
test "no criteria lists every package by position" {
  inspect(
    planned({}),
    content=(
      #|{
      #|  "from": "packages p JOIN package_scores s ON s.package_id = p.id",
      #|  "where": "1 = 1",
      #|  "values": [],
      #|  "orderBy": "s.rank_position ASC, p.full_name ASC",
      #|  "limit": 50,
      #|  "offset": 0
      #|}
    ),
  )
  inspect(
    planned({ "limit": "500", "offset": "40" }),
    content=(
      #|{
      #|  "from": "packages p JOIN package_scores s ON s.package_id = p.id",
      #|  "where": "1 = 1",
      #|  "values": [],
      #|  "orderBy": "s.rank_position ASC, p.full_name ASC",
      #|  "limit": 200,
      #|  "offset": 40
      #|}
    ),
  )
}

///|
test "flat parameters" {
  inspect(
    planned({
      "q": "json",
      "owner": "alice",
      "license": "MIT",
      "rank": "s,A",
      "momentum": "new",
      "min_score": "10",
      "max_score": "300",
      "min_dependents": "1",
      "min_external_dependents": "2",
      "min_owners": "3",
      "max_age": "90",
      "from_year": "2024",
      "to_year": "2026",
      "has_repository": "true",
      "has_license": "false",
      "limit": "20",
    }),
    content=(
      #|{
      #|  "from": "packages p JOIN package_scores s ON s.package_id = p.id JOIN search_index si ON si.rowid = p.id",
      #|  "where": "1 = 1 AND search_index MATCH ? AND LOWER(COALESCE(p.license, '')) LIKE LOWER(?) ESCAPE '\\' AND s.rank_label IN (?, ?) AND s.momentum_label = ? AND s.score >= ? AND s.score <= ? AND p.dependent_count >= ? AND p.external_dependent_count >= ? AND p.dependent_owner_count >= ? AND p.days_since_release <= ? AND CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER) >= ? AND CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER) <= ? AND p.repository IS NOT NULL AND trim(p.repository) <> '' AND (p.license IS NULL OR trim(p.license) = '')",
      #|  "values": [
      #|    "json* AND owner : alice*",
      #|    "%MIT%",
      #|    "S",
      #|    "A",
      #|    "New",
      #|    10,
      #|    300,
      #|    1,
      #|    2,
      #|    3,
      #|    90,
      #|    2024,
      #|    2026
      #|  ],
      #|  "orderBy": "bm25(search_index) ASC, s.score DESC, p.full_name ASC",
      #|  "limit": 20,
      #|  "offset": 0
      #|}
    ),
  )
}

///|
test "a query tree wins over flat parameters and is ordered without bm25" {
  inspect(
    planned({
      "expr": "(owner:alice OR keyword:helper) AND score>=80",
      "q": "x",
    }),
    content=(
      #|{
      #|  "from": "packages p JOIN package_scores s ON s.package_id = p.id",
      #|  "where": "((EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) OR (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?))) AND (s.score >= ?)",
      #|  "values": [
      #|    "owner : alice*",
      #|    "keywords : helper*",
      #|    80
      #|  ],
      #|  "orderBy": "s.rank_position ASC, p.full_name ASC",
      #|  "limit": 50,
      #|  "offset": 0
      #|}
    ),
  )
  inspect(
    planned({ "expr": "  ", "rank": "B" }),
    content=(
      #|{
      #|  "from": "packages p JOIN package_scores s ON s.package_id = p.id",
      #|  "where": "1 = 1 AND s.rank_label = ?",
      #|  "values": [
      #|    "B"
      #|  ],
      #|  "orderBy": "s.rank_position ASC, p.full_name ASC",
      #|  "limit": 50,
      #|  "offset": 0
      #|}
    ),
  )
}

///|
test "parameter errors" {
  inspect(
    plan_error({ "min_score": "abc" }),
    content=(
      #|min_score must be a valid number
    ),
  )
  inspect(
    plan_error({ "min_dependents": "1.5" }),
    content=(
      #|min_dependents must be an integer
    ),
  )
  inspect(
    plan_error({ "min_score": "-1" }),
    content=(
      #|min_score must be greater than or equal to 0
    ),
  )
  inspect(
    plan_error({ "min_score": "5", "max_score": "4" }),
    content=(
      #|min_score cannot be greater than max_score
    ),
  )
  inspect(
    plan_error({ "min_owners": "-1" }),
    content=(
      #|min_owners must be greater than or equal to 0
    ),
  )
  inspect(
    plan_error({ "max_age": "-1" }),
    content=(
      #|max_age must be greater than or equal to 0
    ),
  )
  inspect(
    plan_error({ "from_year": "1969" }),
    content=(
      #|from_year must be between 1970 and 9999
    ),
  )
  inspect(
    plan_error({ "from_year": "2026", "to_year": "2025" }),
    content=(
      #|from_year cannot be greater than to_year
    ),
  )
  inspect(
    plan_error({ "has_license": "yes" }),
    content=(
      #|has_license must be either true or false
    ),
  )
  inspect(
    plan_error({ "rank": "S,X" }),
    content=(
      #|rank must be one of S, A, B, C, D
    ),
  )
  inspect(
    plan_error({ "momentum": "Hot" }),
    content=(
      #|momentum must be one of New, Rising, Stable, Cooling
    ),
  )
  inspect(
    plan_error({ "sort": "constructor" }),
    content=(
      #|sort must be one of relevance, score, growth, downloads, dependents, recent, updated, name, external, owners, position, age
    ),
  )
  inspect(
    plan_error({ "order": "up" }),
    content=(
      #|order must be either asc or desc
    ),
  )
  inspect(
    plan_error({ "expr": "owner:" }),
    content=(
      #|Missing query value
    ),
  )
  inspect(
    plan_error({ "ast": "{" }),
    content=(
      #|Query AST is not valid JSON: Unexpected end of file
    ),
  )
  inspect(
    plan_error({ "q": "AND" }),
    content=(
      #|Search query cannot start with `AND`
    ),
  )
}

///|
test "order by" {
  fn order(sort : String, order : String, fts : Bool) -> String {
    @query_sql.resolve_order_by(sort, order, fts) catch {
      error => "error: " + error.message()
    }
  }

  debug_inspect(
    [
      order("", "", true),
      order("", "", false),
      order("relevance", "desc", false),
      order("SCORE", "", false),
      order("name", "", false),
      order("name", "DESC", false),
      order("position", "", false),
      order("age", "", false),
      order("external", "", false),
      order("owners", "asc", false),
      order("updated", "", false),
      order("growth", "", false),
      order("bogus", "", false),
    ],
    content=(
      #|[
      #|  "bm25(search_index) ASC, s.score DESC, p.full_name ASC",
      #|  "s.rank_position ASC, p.full_name ASC",
      #|  "s.score DESC, p.full_name ASC",
      #|  "s.score DESC, p.full_name ASC",
      #|  "p.full_name ASC",
      #|  "p.full_name DESC",
      #|  "s.rank_position ASC, p.full_name ASC",
      #|  "p.days_since_release ASC, s.score DESC, p.full_name ASC",
      #|  "p.external_dependent_count DESC, s.score DESC, p.full_name ASC",
      #|  "p.dependent_owner_count ASC, s.score DESC, p.full_name ASC",
      #|  "COALESCE(p.latest_created_at, '') DESC, p.full_name ASC",
      #|  "s.score_growth_30d DESC, s.score DESC, p.full_name ASC",
      #|  "error: sort must be one of relevance, score, growth, downloads, dependents, recent, updated, name, external, owners, position, age",
      #|]
    ),
  )
}
