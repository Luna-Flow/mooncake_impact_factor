///|
/// The rank labels, best first, as the scoring model defines them
/// (`@score.rank_labels`). The query, SQL and static search code derive every
/// list of rank values from this one.
let rank_label_list : FixedArray[String] = FixedArray::from_array(
  @score.rank_labels(),
)

///|
/// The momentum labels of the scoring model (`@score.momentum_labels`).
let momentum_label_list : FixedArray[String] = FixedArray::from_array(
  @score.momentum_labels(),
)

///|
/// The rank labels `S`, `A`, `B`, `C`, `D`, best first.
pub fn rank_labels() -> Array[String] {
  Array::from_iter(rank_label_list.iter())
}

///|
/// The momentum labels, currently `New`, `Rising`, `Stable`, `Cooling`.
pub fn momentum_labels() -> Array[String] {
  Array::from_iter(momentum_label_list.iter())
}

///|
fn canonical_label(labels : FixedArray[String], input : String) -> String? {
  for label in labels {
    if label.equal_ignore_ascii_case(input) {
      return Some(label)
    }
  }
  None
}

///|
/// The rank label equal to `input` ignoring ASCII case, for example
/// `canonical_rank_label("a") == Some("A")`. The input is not trimmed.
pub fn canonical_rank_label(input : String) -> String? {
  canonical_label(rank_label_list, input)
}

///|
/// The momentum label equal to `input` ignoring ASCII case, for example
/// `canonical_momentum_label("RISING") == Some("Rising")`. The input is not
/// trimmed.
pub fn canonical_momentum_label(input : String) -> String? {
  canonical_label(momentum_label_list, input)
}

///|
/// The message for a value that is not a label of `labels`, for example
/// `"rank must be one of S, A, B, C, D"`.
fn label_error(name : String, labels : FixedArray[String]) -> QueryError {
  QueryError("\{name} must be one of \{labels.iter().join(", ")}")
}

///|
fn parse_label_list(
  name : String,
  labels : FixedArray[String],
  input : String,
) -> Array[String] raise QueryError {
  let result : Array[String] = []
  for part in input.split(",") {
    let item = trim(part.to_owned())
    if item == "" {
      continue
    }
    guard canonical_label(labels, item) is Some(label) else {
      raise label_error(name, labels)
    }
    if !result.contains(label) {
      result.push(label)
    }
  }
  result
}

///|
/// The canonical rank labels of a comma-separated list such as `"s, a"`.
/// Items are trimmed and matched ignoring ASCII case; blank items and
/// repeats are dropped. An unknown item raises
/// `QueryError("rank must be one of S, A, B, C, D")`.
pub fn parse_rank_list(input : String) -> Array[String] raise QueryError {
  parse_label_list("rank", rank_label_list, input)
}

///|
/// The canonical momentum labels of a comma-separated list such as
/// `"Rising,new"`, with the rules of `parse_rank_list`. An unknown item
/// raises `QueryError("momentum must be one of New, Rising, Stable,
/// Cooling")`.
pub fn parse_momentum_list(input : String) -> Array[String] raise QueryError {
  parse_label_list("momentum", momentum_label_list, input)
}

///|
/// The canonical label for one `rank` or `momentum` value, ignoring ASCII
/// case (the input is not trimmed). An unknown value raises the same
/// `QueryError` as `parse_rank_list` and `parse_momentum_list`. Values of
/// other fields are returned unchanged.
pub fn parse_label(field : Field, input : String) -> String raise QueryError {
  let (name, labels) = match field {
    Rank => ("rank", rank_label_list)
    Momentum => ("momentum", momentum_label_list)
    _ => return input
  }
  match canonical_label(labels, input) {
    Some(label) => label
    None => raise label_error(name, labels)
  }
}
