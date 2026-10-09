///|
/// Result orderings shared by the database search and the static search.
pub(all) enum SortKey {
  /// Matched leaves first (static search) or FTS5 bm25 rank (database).
  Relevance
  Score
  /// 30-day score growth.
  Growth
  Downloads
  Dependents
  /// Recent dependents.
  Recent
  /// Latest release time.
  Updated
  /// Full package name.
  Name
  /// External dependents.
  External
  /// Distinct dependent owners.
  Owners
  /// Rank position, 1 being the best package.
  Position
  /// Days since the latest release.
  Age
} derive(Eq, Debug)

///|
let all_sort_keys : FixedArray[SortKey] = [
  Relevance,
  Score,
  Growth,
  Downloads,
  Dependents,
  Recent,
  Updated,
  Name,
  External,
  Owners,
  Position,
  Age,
]

///|
/// Every sort key, in the order error messages list them.
pub fn SortKey::all() -> Array[SortKey] {
  Array::from_iter(all_sort_keys.iter())
}

///|
/// Name of the sort key in the `sort` URL parameter.
pub fn SortKey::name(self : SortKey) -> String {
  match self {
    Relevance => "relevance"
    Score => "score"
    Growth => "growth"
    Downloads => "downloads"
    Dependents => "dependents"
    Recent => "recent"
    Updated => "updated"
    Name => "name"
    External => "external"
    Owners => "owners"
    Position => "position"
    Age => "age"
  }
}

///|
/// Inverse of `SortKey::name`. Names are case-sensitive.
pub fn SortKey::from_name(name : String) -> SortKey? {
  for key in all_sort_keys {
    if key.name() == name {
      return Some(key)
    }
  }
  None
}

///|
/// Whether the key sorts ascending when no `order` is given. Relevance,
/// name, rank position and age read best from the smallest value; the
/// counts and the score read best from the largest.
pub fn SortKey::ascending_by_default(self : SortKey) -> Bool {
  match self {
    Relevance | Name | Position | Age => true
    _ => false
  }
}

///|
/// The sort used when the request names none: relevance when there is
/// something to be relevant to, otherwise rank position (best first).
pub fn default_sort(has_text_query : Bool) -> SortKey {
  if has_text_query {
    Relevance
  } else {
    Position
  }
}

///|
/// Page size used when `limit` is missing or not a positive number.
pub let default_page_limit : Int = 50

///|
/// Largest page size a request may ask for.
pub let max_page_limit : Int = 200

///|
/// The page size a `limit` parameter asks for: `number_value(input)`
/// truncated toward zero and capped at `max_page_limit`, or
/// `default_page_limit` when it is not a finite number above zero.
pub fn page_limit(input : String) -> Int {
  let value = number_value(input)
  if value.is_nan() || value.is_inf() || value <= 0.0 {
    return default_page_limit
  }
  let truncated = value.trunc()
  if truncated >= max_page_limit.to_double() {
    max_page_limit
  } else {
    truncated.to_int()
  }
}

///|
/// The number of matches an `offset` parameter skips: `number_value(input)`
/// truncated toward zero, or `0` when it is not a finite number of at least
/// zero. Offsets beyond the last match give an empty page.
pub fn page_offset(input : String) -> Int {
  let value = number_value(input)
  if value.is_nan() || value.is_inf() || value < 0.0 {
    return 0
  }
  let truncated = value.trunc()
  if truncated >= 2147483647.0 {
    2147483647
  } else {
    truncated.to_int()
  }
}
