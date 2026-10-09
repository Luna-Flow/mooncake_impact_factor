///|
/// `ORDER BY` terms of a sort key in one direction. Ties fall back to the
/// score (best first) and then to the package name, so every order is
/// total and pages never overlap.
fn order_clause(key : @query.SortKey, ascending : Bool) -> String {
  let dir = if ascending { "ASC" } else { "DESC" }
  match key {
    Relevance | Score => "s.score \{dir}, p.full_name ASC"
    Growth => "s.score_growth_30d \{dir}, s.score DESC, p.full_name ASC"
    Downloads => "p.download_count \{dir}, s.score DESC, p.full_name ASC"
    Dependents => "p.dependent_count \{dir}, s.score DESC, p.full_name ASC"
    Recent => "p.recent_dependent_count \{dir}, s.score DESC, p.full_name ASC"
    Updated => "COALESCE(p.latest_created_at, '') \{dir}, p.full_name ASC"
    Name => "p.full_name \{dir}"
    External =>
      "p.external_dependent_count \{dir}, s.score DESC, p.full_name ASC"
    Owners => "p.dependent_owner_count \{dir}, s.score DESC, p.full_name ASC"
    Position => "s.rank_position \{dir}, p.full_name ASC"
    Age => "p.days_since_release \{dir}, s.score DESC, p.full_name ASC"
  }
}

///|
/// The `ORDER BY` clause for the `sort` and `order` parameters.
///
/// A blank `sort` means `@query.default_sort(has_fts_query)` and a blank
/// `order` the key's default direction; both are read ignoring ASCII case.
/// Relevance is FTS5's `bm25` rank when the query has an FTS5 `MATCH` and
/// the score otherwise, and it ignores `order`.
pub fn resolve_order_by(
  sort : String,
  order : String,
  has_fts_query : Bool,
) -> String raise SqlError {
  let sort_text = @query.trim(sort)
  let sort_name = if sort_text == "" {
    @query.default_sort(has_fts_query).name()
  } else {
    sort_text.to_lower()
  }
  let key = @query.SortKey::from_name(sort_name)
  let default_order = match key {
    Some(key) if key.ascending_by_default() => "asc"
    _ => "desc"
  }
  let order_text = @query.trim(order)
  let order_name = if order_text == "" {
    default_order
  } else {
    order_text.to_lower()
  }
  if order_name != "asc" && order_name != "desc" {
    raise SqlError("order must be either asc or desc")
  }
  guard key is Some(key) else {
    let names = @query.SortKey::all().map(key => key.name()).join(", ")
    raise SqlError("sort must be one of \{names}")
  }
  match key {
    Relevance =>
      if has_fts_query {
        "bm25(search_index) ASC, s.score DESC, p.full_name ASC"
      } else {
        "s.score DESC, p.full_name ASC"
      }
    _ => order_clause(key, order_name == "asc")
  }
}

///|
/// The FTS5 expression for the free-text parameters, joined with `AND`:
/// `q` through `compile_fts_expression`, the other four through
/// `compile_field_expression` on their column. `None` when all are blank.
pub fn build_fts_query(
  q~ : String,
  owner~ : String,
  package_name~ : String,
  keyword~ : String,
  description~ : String,
) -> String? raise SqlError {
  let clauses = []
  if q != "" {
    clauses.push(compile_fts_expression(q))
  }
  if owner != "" {
    clauses.push(compile_field_expression("owner", owner))
  }
  if package_name != "" {
    clauses.push(compile_field_expression("package_name", package_name))
  }
  if keyword != "" {
    clauses.push(compile_field_expression("keywords", keyword))
  }
  if description != "" {
    clauses.push(compile_field_expression("description", description))
  }
  if clauses.is_empty() {
    None
  } else {
    Some(clauses.join(" AND "))
  }
}

///|
/// How to run one search request against the database.
pub(all) struct SearchPlan {
  /// The `FROM` clause: `packages p` joined with `package_scores s`, and with
  /// `search_index` when the order uses its `bm25` rank.
  from : String
  /// The `WHERE` condition and its values.
  where_clause : Fragment
  /// The `ORDER BY` clause.
  order_by : String
  /// Page size, for `LIMIT ?`.
  limit : Int
  /// Matches to skip, for `OFFSET ?`.
  offset : Int
} derive(Eq, Debug)

///|
/// `{"from","where","values","orderBy","limit","offset"}`
pub impl ToJson for SearchPlan with fn to_json(self) {
  Json::object({
    "from": self.from.to_json(),
    "where": self.where_clause.sql.to_json(),
    "values": Json::array(
      self.where_clause.values.map(value => value.to_json()),
    ),
    "orderBy": self.order_by.to_json(),
    "limit": self.limit.to_json(),
    "offset": self.offset.to_json(),
  })
}

///|
pub extend SearchPlan with ToJson::{to_json}

///|
let base_from = "packages p JOIN package_scores s ON s.package_id = p.id"

///|
fn check_non_negative(label : String, value : Double?) -> Unit raise SqlError {
  if value is Some(number) && number < 0.0 {
    raise SqlError("\{label} must be greater than or equal to 0")
  }
}

///|
fn check_year(label : String, value : Double?) -> Unit raise SqlError {
  if value is Some(year) && (year < 1970.0 || year > 9999.0) {
    raise SqlError("\{label} must be between 1970 and 9999")
  }
}

///|
/// Plans a search from the URL parameters of `/api/search` (`q`, `owner`,
/// `package`, `keyword`, `description`, `license`, `repository`, `rank`,
/// `momentum`, `min_score`, `max_score`, `min_dependents`,
/// `min_recent_dependents`, `min_external_dependents`, `min_owners`,
/// `max_age`, `min_downloads`, `from_year`, `to_year`, `has_repository`,
/// `has_license`, `sort`, `order`, `expr`, `ast`, `limit`, `offset`). Missing
/// keys count as blank.
///
/// Every parameter is validated first. Then a query tree from `ast` or
/// `expr` with intent is compiled with `compile_ast`; otherwise the flat
/// parameters are combined with `AND`, the text ones as one FTS5 `MATCH`.
/// A request without any criterion matches every package. `rank` and
/// `momentum` take comma-separated label lists.
pub fn plan_search(params : Map[String, String]) -> SearchPlan raise SqlError {
  fn get(key : String) -> String {
    params.get(key).unwrap_or("")
  }

  let q = @query.trim(get("q"))
  let owner = @query.trim(get("owner"))
  let package_name = @query.trim(get("package"))
  let keyword = @query.trim(get("keyword"))
  let description = @query.trim(get("description"))
  let license = @query.trim(get("license"))
  let repository = @query.trim(get("repository"))
  let limit = @query.page_limit(get("limit"))
  let offset = @query.page_offset(get("offset"))
  let min_score = parse_number(get("min_score"), "min_score")
  let max_score = parse_number(get("max_score"), "max_score")
  let integers = [
    ("min_dependents", "p.dependent_count >= ?"),
    ("min_recent_dependents", "p.recent_dependent_count >= ?"),
    ("min_external_dependents", "p.external_dependent_count >= ?"),
    ("min_owners", "p.dependent_owner_count >= ?"),
    ("min_downloads", "p.download_count >= ?"),
    ("max_age", "p.days_since_release <= ?"),
  ]
  let integer_values = []
  for item in integers {
    integer_values.push(parse_number(get(item.0), item.0, integer=true))
  }
  let from_year = parse_number(get("from_year"), "from_year", integer=true)
  let to_year = parse_number(get("to_year"), "to_year", integer=true)
  let has_repository = parse_boolean(get("has_repository"), "has_repository")
  let has_license = parse_boolean(get("has_license"), "has_license")
  let sort = @query.trim(get("sort"))
  let order = @query.trim(get("order"))
  check_non_negative("min_score", min_score)
  check_non_negative("max_score", max_score)
  if min_score is Some(low) && max_score is Some(high) && low > high {
    raise SqlError("min_score cannot be greater than max_score")
  }
  for i, item in integers {
    check_non_negative(item.0, integer_values[i])
  }
  check_year("from_year", from_year)
  check_year("to_year", to_year)
  if from_year is Some(low) && to_year is Some(high) && low > high {
    raise SqlError("from_year cannot be greater than to_year")
  }
  let ranks = normalize_rank_labels(get("rank"))
  let momenta = normalize_momentum_labels(get("momentum"))
  let has_text_filters = q != "" ||
    owner != "" ||
    package_name != "" ||
    keyword != "" ||
    description != ""
  let _ = resolve_order_by(sort, order, has_text_filters)
  let tree = @query.decode_from_params({
    "ast": @query.trim(get("ast")),
    "expr": @query.trim(get("expr")),
  }) catch {
    error => raise sql_error_of(error)
  }
  if tree is Some(ast) && ast.has_intent() {
    return {
      from: base_from,
      where_clause: compile_ast(ast),
      order_by: resolve_order_by(sort, order, false),
      limit,
      offset,
    }
  }
  let fts = build_fts_query(q~, owner~, package_name~, keyword~, description~)
  let conditions = ["1 = 1"]
  let values : Array[SqlValue] = []
  fn add(fragment : Fragment) {
    conditions.push(fragment.sql)
    values.append(fragment.values)
  }

  if fts is Some(expression) {
    add({ sql: "search_index MATCH ?", values: [Text(expression)], })
  }
  if license != "" {
    add(like_condition("p.license", license))
  }
  if repository != "" {
    add(like_condition("p.repository", repository))
  }
  if label_condition("s.rank_label", ranks) is Some(condition) {
    add(condition)
  }
  if label_condition("s.momentum_label", momenta) is Some(condition) {
    add(condition)
  }
  if min_score is Some(value) {
    add({ sql: "s.score >= ?", values: [Number(value)], })
  }
  if max_score is Some(value) {
    add({ sql: "s.score <= ?", values: [Number(value)], })
  }
  for i, item in integers {
    if integer_values[i] is Some(value) {
      add({ sql: item.1, values: [Number(value)], })
    }
  }
  if from_year is Some(value) {
    add({ sql: "\{year_sql} >= ?", values: [Number(value)], })
  }
  if to_year is Some(value) {
    add({ sql: "\{year_sql} <= ?", values: [Number(value)], })
  }
  if has_repository is Some(present) {
    add(presence_condition("p.repository", present))
  }
  if has_license is Some(present) {
    add(presence_condition("p.license", present))
  }
  {
    from: if fts is Some(_) {
      base_from + " JOIN search_index si ON si.rowid = p.id"
    } else {
      base_from
    },
    where_clause: { sql: conditions.join(" AND "), values, },
    order_by: resolve_order_by(sort, order, fts is Some(_)),
    limit,
    offset,
  }
}
