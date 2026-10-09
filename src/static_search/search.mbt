///|
/// Version tag of the static search runtime. JavaScript code that depends
/// on the exported functions can check it. `v2` is the MoonBit search
/// engine with `load_index` and `search`.
pub fn runtime_version() -> String {
  "static-search-v2"
}

///|
/// One page of search results.
pub(all) struct SearchResult {
  /// Indices into the searched items, in result order.
  indices : Array[Int]
  /// Number of matching items before paging.
  total : Int
} derive(Eq, Debug)

///|
pub impl ToJson for SearchResult with fn to_json(self) {
  Json::object({
    "indices": Json::array(self.indices.map(index => index.to_json())),
    "total": self.total.to_json(),
  })
}

///|
pub extend SearchResult with ToJson::{to_json}

///|
fn compare_doubles(left : Double, right : Double) -> Int {
  if left < right {
    -1
  } else if left > right {
    1
  } else {
    0
  }
}

///|
/// The value a sort key orders by. Relevance and name have none; an
/// unknown key orders by score.
fn sort_value(key : @query.SortKey?, item : IndexItem) -> Double {
  match key {
    Some(Growth) => item.score_growth_30d
    Some(Downloads) => item.download_count
    Some(Dependents) => item.dependent_count
    Some(Recent) => item.recent_dependent_count
    Some(Updated) => package_year(item)
    Some(External) => item.external_dependent_count
    Some(Owners) => item.dependent_owner_count
    Some(Position) => item.rank_position
    Some(Age) => item.days_since_release
    _ => item.score
  }
}

///|
/// Sorts the indices of `items` for the `sort` and `order` parameters.
///
/// A blank `sort` means relevance when the query has intent and position
/// otherwise; a blank `order` means the key's default direction (an unknown
/// key sorts like `score`, descending). `order` is `asc` or anything else
/// for descending. Relevance sorts by matched leaves (most first), then
/// score (highest first), then name, whatever `order` says. Every other key
/// compares its value and then the name with `collate`, both in the chosen
/// direction. Equal items keep their index order.
pub fn sort_indices(
  items : Array[IndexItem],
  indices : Array[Int],
  ast : @query.Group,
  sort~ : String,
  order~ : String,
) -> Array[Int] {
  let sort_name = if sort == "" {
    @query.default_sort(ast.has_intent()).name()
  } else {
    sort
  }
  let key = @query.SortKey::from_name(sort_name)
  let order_name = if order != "" {
    order
  } else if key is Some(key) && key.ascending_by_default() {
    "asc"
  } else {
    "desc"
  }
  let factor = if order_name == "asc" { 1 } else { -1 }
  let by_relevance = key is Some(Relevance)
  let scores = if by_relevance {
    indices.map(index => relevance(items[index], ast))
  } else {
    []
  }
  let positions = Array::makei(indices.length(), i => i)
  positions.sort_by((a, b) => {
    let left = items[indices[a]]
    let right = items[indices[b]]
    let order = if by_relevance {
      let by_matches = scores[b].compare(scores[a])
      if by_matches != 0 {
        by_matches
      } else {
        let by_score = compare_doubles(right.score, left.score)
        if by_score != 0 {
          by_score
        } else {
          collate(left.full_name, right.full_name)
        }
      }
    } else if key is Some(Name) {
      factor * collate(left.full_name, right.full_name)
    } else {
      let by_value = compare_doubles(
        sort_value(key, left),
        sort_value(key, right),
      )
      factor *
      (if by_value != 0 {
        by_value
      } else {
        collate(left.full_name, right.full_name)
      })
    }
    if order != 0 {
      order
    } else {
      a.compare(b)
    }
  })
  positions.map(position => indices[position])
}

///|
/// Runs one search over `items` with the parameters of the web interface
/// (`q`, `owner`, `packageName`, …, `sort`, `order`, `expr`, `ast`, `limit`,
/// `offset`).
///
/// The query tree is `@query.derive_ast(params)`. Without intent every item
/// matches; otherwise the items for which `evaluate` holds. The matches are
/// ordered with `sort_indices` and cut to the page given by
/// `@query.page_limit` and `@query.page_offset`.
pub fn search_items(
  items : Array[IndexItem],
  params : Map[String, String],
) -> SearchResult raise @query.QueryError {
  let ast = @query.derive_ast(params)
  let root = @query.Node::Group(ast)
  let matched = []
  let filter = ast.has_intent()
  for index, item in items {
    if !filter || evaluate(item, root) {
      matched.push(index)
    }
  }
  let sorted = sort_indices(
    items,
    matched,
    ast,
    sort=params.get("sort").unwrap_or(""),
    order=params.get("order").unwrap_or(""),
  )
  let limit = @query.page_limit(params.get("limit").unwrap_or(""))
  let offset = @query.page_offset(params.get("offset").unwrap_or(""))
  let total = sorted.length()
  let start = if offset < total { offset } else { total }
  let end = if limit < total - start { start + limit } else { total }
  { indices: sorted[start:end].to_owned(), total, }
}
