///|
/// Boolean connective of a group node.
///
/// `And` is satisfied when every child is satisfied (an empty `And` group is
/// always satisfied), `Or` when at least one child is.
pub(all) enum GroupOp {
  And
  Or
} derive(Eq, Debug)

///|
/// Lower-case name of the connective, as it appears in the JSON form
/// (`"and"`, `"or"`).
pub fn GroupOp::name(self : GroupOp) -> String {
  match self {
    And => "and"
    Or => "or"
  }
}

///|
/// Inverse of `GroupOp::name`. Only the exact lower-case names are accepted.
pub fn GroupOp::from_name(name : String) -> GroupOp? {
  match name {
    "and" => Some(And)
    "or" => Some(Or)
    _ => None
  }
}

///|
/// Package attribute a term node tests.
pub(all) enum Field {
  Text
  Owner
  Package
  Keyword
  Description
  License
  Repository
  Rank
  Momentum
  Score
  Dependents
  RecentDependents
  /// Dependents published by other owners.
  ExternalDependents
  /// Distinct other owners that depend on the package.
  Owners
  Downloads
  Year
  /// Days since the latest release.
  Age
  /// Rank position, 1 being the best package.
  Position
  HasRepository
  HasLicense
} derive(Eq, Debug)

///|
let all_fields : FixedArray[Field] = [
  Text,
  Owner,
  Package,
  Keyword,
  Description,
  License,
  Repository,
  Rank,
  Momentum,
  Score,
  Dependents,
  RecentDependents,
  ExternalDependents,
  Owners,
  Downloads,
  Year,
  Age,
  Position,
  HasRepository,
  HasLicense,
]

///|
/// Every field, in the order the query builder lists them.
pub fn Field::all() -> Array[Field] {
  Array::from_iter(all_fields.iter())
}

///|
/// Name of the field in the expression language and in the JSON form, for
/// example `"recent_dependents"`.
pub fn Field::name(self : Field) -> String {
  match self {
    Text => "text"
    Owner => "owner"
    Package => "package"
    Keyword => "keyword"
    Description => "description"
    License => "license"
    Repository => "repository"
    Rank => "rank"
    Momentum => "momentum"
    Score => "score"
    Dependents => "dependents"
    RecentDependents => "recent_dependents"
    ExternalDependents => "external_dependents"
    Owners => "owners"
    Downloads => "downloads"
    Year => "year"
    Age => "age"
    Position => "position"
    HasRepository => "has_repository"
    HasLicense => "has_license"
  }
}

///|
/// Inverse of `Field::name`. Field names are case-sensitive.
pub fn Field::from_name(name : String) -> Field? {
  for field in all_fields {
    if field.name() == name {
      return Some(field)
    }
  }
  None
}

///|
/// Comparison a term node applies to its field.
pub(all) enum Operator {
  /// `field:value`, substring match for text fields.
  Match
  /// `field=value`
  Eq
  /// `field>=value`
  Gte
  /// `field<=value`
  Lte
} derive(Eq, Debug)

///|
/// Name of the operator in the JSON form (`"match"`, `"eq"`, `"gte"`,
/// `"lte"`).
pub fn Operator::name(self : Operator) -> String {
  match self {
    Match => "match"
    Eq => "eq"
    Gte => "gte"
    Lte => "lte"
  }
}

///|
/// Inverse of `Operator::name`.
pub fn Operator::from_name(name : String) -> Operator? {
  match name {
    "match" => Some(Match)
    "eq" => Some(Eq)
    "gte" => Some(Gte)
    "lte" => Some(Lte)
    _ => None
  }
}

///|
/// Spelling of the operator in the expression language (`:`, `=`, `>=`,
/// `<=`).
pub fn Operator::symbol(self : Operator) -> String {
  match self {
    Match => ":"
    Eq => "="
    Gte => ">="
    Lte => "<="
  }
}

///|
/// Leaf of the query tree: `field operator value`, optionally negated.
///
/// `value` is kept as the user typed it; numeric and boolean fields read it
/// with `number_value` or by comparing it with `"true"` when they are
/// evaluated.
pub(all) struct Term {
  field : Field
  operator : Operator
  value : String
  negated : Bool
} derive(Eq, Debug)

///|
/// Builds a term. `negated` defaults to `false`.
pub fn Term::make(
  field : Field,
  operator : Operator,
  value : String,
  negated? : Bool = false,
) -> Term {
  { field, operator, value, negated, }
}

///|
/// Inner node of the query tree: children joined by `op`, optionally
/// negated.
pub(all) struct Group {
  op : GroupOp
  children : Array[Node]
  negated : Bool
} derive(Eq, Debug)

///|
/// Builds a group. `negated` defaults to `false`.
pub fn Group::make(
  op : GroupOp,
  children : Array[Node],
  negated? : Bool = false,
) -> Group {
  { op, children, negated, }
}

///|
/// A node of the query tree. The root of a query is always a `Group`.
pub(all) enum Node {
  Term(Term)
  Group(Group)
} derive(Eq, Debug)

///|
/// A term node: `Term(Term::make(field, operator, value, negated~))`.
pub fn term(
  field : Field,
  operator : Operator,
  value : String,
  negated? : Bool = false,
) -> Node {
  Term(Term::make(field, operator, value, negated~))
}

///|
/// A group node: `Group(Group::make(op, children, negated~))`.
pub fn group(
  op : GroupOp,
  children : Array[Node],
  negated? : Bool = false,
) -> Node {
  Group(Group::make(op, children, negated~))
}

///|
/// Whether the node is negated.
pub fn Node::negated(self : Node) -> Bool {
  match self {
    Term(term) => term.negated
    Group(group) => group.negated
  }
}

///|
/// Returns the node with its `negated` flag flipped.
pub fn Node::toggle_negation(self : Node) -> Node {
  match self {
    Term(term) => Term({ ..term, negated: !term.negated, })
    Group(group) => Group({ ..group, negated: !group.negated, })
  }
}

///|
/// The query that matches everything: an empty `And` group.
pub fn empty_ast() -> Group {
  Group::make(And, [])
}

///|
/// Whether the node asks for anything: a term with a non-blank value, or a
/// group containing such a term.
pub fn Node::has_intent(self : Node) -> Bool {
  match self {
    Term(term) => trim(term.value) != ""
    Group(group) => group.has_intent()
  }
}

///|
/// Whether the query asks for anything. A query without intent shows the
/// default listing instead of a filtered one, and it sorts by score instead
/// of relevance.
pub fn Group::has_intent(self : Group) -> Bool {
  self.children.iter().any(child => child.has_intent())
}
