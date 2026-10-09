///|
/// The year of the latest release: the first four characters of
/// `latest_created_at` read with `@query.number_value`, or `0` when the
/// date is missing, shorter than four characters or not a number.
pub fn package_year(item : IndexItem) -> Double {
  guard item.latest_created_at is Some(text) && text.length() >= 4 else {
    return 0.0
  }
  let value = @query.number_value(text.unsafe_substring(start=0, end=4))
  if value.is_nan() || value.is_inf() {
    0.0
  } else {
    value
  }
}

///|
/// Substring test of a lower-case haystack against a needle that is
/// trimmed and lower-cased first. A blank needle matches everything.
fn match_text(haystack : String, needle : String) -> Bool {
  let normalized = normalize_text(@query.trim(needle))
  normalized == "" || haystack.contains(normalized)
}

///|
fn compare_numeric(
  left : Double,
  operator : @query.Operator,
  right : Double,
) -> Bool {
  if right.is_nan() || right.is_inf() {
    return false
  }
  match operator {
    Gte => left >= right
    Lte => left <= right
    Eq | Match => left == right
  }
}

///|
/// Label comparison: the value is read as a label ignoring case and
/// surrounding white space; a value that is no label is compared as given.
fn match_label(actual : String, field : @query.Field, value : String) -> Bool {
  let wanted = @query.parse_label(field, @query.trim(value)) catch {
    _ => value
  }
  actual == wanted
}

///|
/// Whether the item satisfies the term, ignoring the term's negation.
///
/// Text fields are substring matches on the lower-case index texts (a
/// keyword term matches when one keyword contains the value); labels are
/// compared as canonical labels; numeric fields compare with the value read
/// by `@query.number_value` (a value that is not a finite number matches
/// nothing, and `:` means `=`); the presence flags compare with
/// `value == "true"`. The operator of text, label and flag terms is not
/// checked, so the static site accepts what the database would reject.
pub fn match_term(item : IndexItem, term : @query.Term) -> Bool {
  let value = term.value
  fn numeric(left : Double) -> Bool {
    compare_numeric(left, term.operator, @query.number_value(value))
  }

  match term.field {
    Text => match_text(item.normalized_full_text, value)
    Owner => match_text(item.normalized_owner, value)
    Package => match_text(item.normalized_package, value)
    Keyword =>
      item.normalized_keywords.iter().any(keyword => match_text(keyword, value))
    Description => match_text(item.normalized_description, value)
    License => match_text(item.normalized_license, value)
    Repository => match_text(item.normalized_repository, value)
    Rank => match_label(item.rank_label, Rank, value)
    Momentum => match_label(item.momentum_label, Momentum, value)
    Score => numeric(item.score)
    Dependents => numeric(item.dependent_count)
    RecentDependents => numeric(item.recent_dependent_count)
    ExternalDependents => numeric(item.external_dependent_count)
    Owners => numeric(item.dependent_owner_count)
    Downloads => numeric(item.download_count)
    Year => numeric(package_year(item))
    Age => numeric(item.days_since_release)
    Position => numeric(item.rank_position)
    HasRepository => item.repository_present == (value == "true")
    HasLicense => item.license_present == (value == "true")
  }
}

///|
/// Whether the item satisfies the node, negation included. An empty `And`
/// group is satisfied, an empty `Or` group is not.
pub fn evaluate(item : IndexItem, node : @query.Node) -> Bool {
  let matched = match node {
    Term(term) => match_term(item, term)
    Group({ op: And, children, .. }) =>
      children.iter().all(child => evaluate(item, child))
    Group({ op: Or, children, .. }) =>
      children.iter().any(child => evaluate(item, child))
  }
  if node.negated() {
    !matched
  } else {
    matched
  }
}

///|
fn count_matches(
  item : IndexItem,
  node : @query.Node,
  negated_above : Bool,
) -> Int {
  let negated = negated_above != node.negated()
  match node {
    Term(term) => if !negated && match_term(item, term) { 1 } else { 0 }
    Group(group) => {
      let mut sum = 0
      for child in group.children {
        sum += count_matches(item, child, negated)
      }
      sum
    }
  }
}

///|
/// The number of positive term leaves of the query the item matches.
///
/// A leaf whose effective polarity is negative (negated itself, or below an
/// odd number of negated groups) never counts: matching it is what the
/// query excludes, so it must not rank a package higher (issue #4).
pub fn relevance(item : IndexItem, ast : @query.Group) -> Int {
  count_matches(item, Group(ast), false)
}
