///|
/// The rank labels, best first. This is the only list of rank values in the
/// query, SQL and static search code; everything else derives from it.
let rank_label_list : FixedArray[String] = ["S", "A", "B", "C", "D"]

///|
/// The momentum labels. This is the only list of momentum values in the
/// query, SQL and static search code; extend it here to add a label.
let momentum_label_list : FixedArray[String] = [
  "New", "Rising", "Stable", "Cooling",
]

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
