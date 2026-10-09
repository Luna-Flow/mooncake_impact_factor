///|
/// One package of the static search index (`search/search-index.json`), as
/// far as searching needs it. The `normalized_*` texts are lower case.
pub(all) struct IndexItem {
  full_name : String
  rank_label : String
  momentum_label : String
  score : Double
  score_growth_30d : Double
  download_count : Double
  dependent_count : Double
  recent_dependent_count : Double
  external_dependent_count : Double
  dependent_owner_count : Double
  days_since_release : Double
  rank_position : Double
  latest_created_at : String?
  repository_present : Bool
  license_present : Bool
  normalized_full_text : String
  normalized_owner : String
  normalized_package : String
  normalized_description : String
  normalized_license : String
  normalized_repository : String
  normalized_keywords : Array[String]
} derive(Eq, Debug)

///|
/// Error raised for an index document that does not have the expected
/// shape.
pub suberror IndexError {
  IndexError(String)
} derive(Eq, Debug)

///|
/// The message carried by the error.
pub fn IndexError::message(self : IndexError) -> String {
  match self {
    IndexError(message) => message
  }
}

///|
fn field_error(name : String, expected : String) -> IndexError {
  IndexError("Index item field `\{name}` must be \{expected}")
}

///|
fn string_field(
  fields : Map[String, Json],
  name : String,
) -> String raise IndexError {
  guard fields.get(name) is Some(String(value)) else {
    raise field_error(name, "a string")
  }
  value
}

///|
fn number_field(
  fields : Map[String, Json],
  name : String,
) -> Double raise IndexError {
  guard fields.get(name) is Some(Number(value, ..)) else {
    raise field_error(name, "a number")
  }
  value
}

///|
fn bool_field(
  fields : Map[String, Json],
  name : String,
) -> Bool raise IndexError {
  match fields.get(name) {
    Some(True) => true
    Some(False) => false
    _ => raise field_error(name, "a boolean")
  }
}

///|
/// Reads one index item. Unknown members are ignored; a missing or
/// mistyped member raises `IndexError`.
pub fn IndexItem::from_json(json : Json) -> IndexItem raise IndexError {
  guard json is Object(fields) else {
    raise IndexError("Index item must be an object")
  }
  let latest_created_at = match fields.get("latest_created_at") {
    Some(String(text)) => Some(text)
    Some(Null) | None => None
    _ => raise field_error("latest_created_at", "a string or null")
  }
  guard fields.get("normalized_keywords") is Some(Array(raw_keywords)) else {
    raise field_error("normalized_keywords", "an array of strings")
  }
  let keywords = []
  for keyword in raw_keywords {
    guard keyword is String(text) else {
      raise field_error("normalized_keywords", "an array of strings")
    }
    keywords.push(text)
  }
  {
    full_name: string_field(fields, "full_name"),
    rank_label: string_field(fields, "rank_label"),
    momentum_label: string_field(fields, "momentum_label"),
    score: number_field(fields, "score"),
    score_growth_30d: number_field(fields, "score_growth_30d"),
    download_count: number_field(fields, "download_count"),
    dependent_count: number_field(fields, "dependent_count"),
    recent_dependent_count: number_field(fields, "recent_dependent_count"),
    external_dependent_count: number_field(fields, "external_dependent_count"),
    dependent_owner_count: number_field(fields, "dependent_owner_count"),
    days_since_release: number_field(fields, "days_since_release"),
    rank_position: number_field(fields, "rank_position"),
    latest_created_at,
    repository_present: bool_field(fields, "repository_present"),
    license_present: bool_field(fields, "license_present"),
    normalized_full_text: string_field(fields, "normalized_full_text"),
    normalized_owner: string_field(fields, "normalized_owner"),
    normalized_package: string_field(fields, "normalized_package"),
    normalized_description: string_field(fields, "normalized_description"),
    normalized_license: string_field(fields, "normalized_license"),
    normalized_repository: string_field(fields, "normalized_repository"),
    normalized_keywords: keywords,
  }
}

///|
/// Reads an index document: `{"items":[…]}` or a bare array of items.
pub fn parse_index(text : String) -> Array[IndexItem] raise IndexError {
  let json = @json.parse(text) catch {
    error => raise IndexError("Static search index is not valid JSON: \{error}")
  }
  let raw_items = match json {
    Object({ "items": Array(items), .. }) => items
    Array(items) => items
    _ => raise IndexError("Static search index must have an items array")
  }
  let items = []
  for raw in raw_items {
    items.push(IndexItem::from_json(raw))
  }
  items
}
