///|
/// Weight of a dependent published by the same owner as the package it
/// depends on. An owner who splits one project into many packages adds one
/// dependent per package; counting each of them fully would let a package
/// rank on its author's own reuse. Journal impact factors meet the same
/// problem with self-citations.
pub const SELF_DEPENDENT_WEIGHT : Double = 0.25

///|
/// The rank labels, best first. The scoring model owns them; the query
/// language, the SQL compiler and the static search take them from here.
pub fn rank_labels() -> Array[String] {
  ["S", "A", "B", "C", "D"]
}

///|
/// The momentum labels that `compute_momentum_label` returns.
pub fn momentum_labels() -> Array[String] {
  ["New", "Rising", "Stable", "Cooling"]
}

///|
/// Days since release used when the release date is unknown.
pub const UNKNOWN_RELEASE_AGE_DAYS : Int = 3650

///|
/// The signals of one package at one point in time.
///
/// A dependent is a package whose latest release declares this package as a
/// dependency. It is external when its owner differs from this package's
/// owner, and recent when the dependency first appeared in the 180 days
/// before the point in time.
pub(all) struct Signals {
  external_dependents : Int
  self_dependents : Int
  recent_external_dependents : Int
  recent_self_dependents : Int
  downloads : Int
  days_since_release : Int
} derive(ToJson, FromJson, Debug, Eq)

///|
pub fn clamp_non_negative(value : Int) -> Int {
  if value < 0 {
    0
  } else {
    value
  }
}

///|
/// The release-recency factor m(t): 1.12 up to 30 days after the latest
/// release, falling linearly to 0.88 at 365 days, and 0.88 afterwards.
/// Negative days count as 0.
pub fn activity_multiplier(days_since_release : Int) -> Double {
  let days = clamp_non_negative(days_since_release)
  if days <= 30 {
    1.12
  } else if days >= 365 {
    0.88
  } else {
    1.12 - 0.24 * (days - 30).to_double() / 335.0
  }
}

///|
/// The dependent count that enters the score: external dependents count
/// once, dependents of the same owner count `SELF_DEPENDENT_WEIGHT`.
pub fn weighted_dependents(external : Int, self_owned : Int) -> Double {
  clamp_non_negative(external).to_double() +
  SELF_DEPENDENT_WEIGHT * clamp_non_negative(self_owned).to_double()
}

///|
/// sigma(n) = ln(1 + max(n, 0)).
pub fn log_signal(value : Double) -> Double {
  if value > 0.0 {
    ln(1.0 + value)
  } else {
    0.0
  }
}

///|
pub const DEPENDENTS_WEIGHT : Double = 38.0

///|
pub const RECENT_DEPENDENTS_WEIGHT : Double = 27.0

///|
pub const DOWNLOADS_WEIGHT : Double = 22.0

///|
/// The three terms of the base score and the multiplier, so that a reader
/// can see where a score comes from. The score is
/// `(dependents + recent_dependents + downloads) * multiplier`.
pub struct ScoreBreakdown {
  dependents : Double
  recent_dependents : Double
  downloads : Double
  multiplier : Double
} derive(ToJson, FromJson, Debug)

///|
pub fn score_breakdown(signals : Signals) -> ScoreBreakdown {
  let dependents = weighted_dependents(
    signals.external_dependents,
    signals.self_dependents,
  )
  let recent = weighted_dependents(
    signals.recent_external_dependents,
    signals.recent_self_dependents,
  )
  let downloads = clamp_non_negative(signals.downloads).to_double()
  {
    dependents: DEPENDENTS_WEIGHT * log_signal(dependents),
    recent_dependents: RECENT_DEPENDENTS_WEIGHT * log_signal(recent),
    downloads: DOWNLOADS_WEIGHT * log_signal(downloads),
    multiplier: activity_multiplier(signals.days_since_release),
  }
}

///|
/// The impact score
///
///   S = m(t) * (38 sigma(D) + 27 sigma(R) + 22 sigma(W))
///
/// where D and R are the weighted dependents and recent dependents and W the
/// downloads.
pub fn compute_score(signals : Signals) -> Double {
  let parts = score_breakdown(signals)
  (parts.dependents + parts.recent_dependents + parts.downloads) *
  parts.multiplier
}

///|
/// Competition ranks of `scores`, best first: the position of a score is one
/// plus the number of strictly greater scores, so equal scores share a
/// position. `NaN` counts as smaller than every number.
pub fn rank_positions(scores : ArrayView[Double]) -> Array[Int] {
  let n = scores.length()
  let order = Array::makei(n, i => i)
  order.sort_by((a, b) => compare_scores_descending(scores[a], scores[b]))
  let positions = Array::make(n, 0)
  for k in 0..<n {
    let index = order[k]
    positions[index] = if k > 0 &&
      compare_scores_descending(scores[order[k - 1]], scores[index]) == 0 {
      positions[order[k - 1]]
    } else {
      k + 1
    }
  }
  positions
}

///|
fn compare_scores_descending(a : Double, b : Double) -> Int {
  match (a.is_nan(), b.is_nan()) {
    (true, true) => 0
    (true, false) => 1
    (false, true) => -1
    (false, false) => if a > b { -1 } else if a < b { 1 } else { 0 }
  }
}

///|
/// The rank label of a package at competition position `position` (1 is
/// best) among `population` packages. With q = (position - 1) / population,
/// the share of packages that score strictly higher:
///
///   S if q < 5%, A if q < 15%, B if q < 35%, C if q < 65%, D otherwise.
///
/// A package without any signal (`score <= 0` or `NaN`) is always `D`.
pub fn rank_label(position : Int, population : Int, score : Double) -> String {
  if population <= 0 || position <= 0 || score.is_nan() || score <= 0.0 {
    return "D"
  }
  let above = (position - 1).to_double() / population.to_double()
  if above < 0.05 {
    "S"
  } else if above < 0.15 {
    "A"
  } else if above < 0.35 {
    "B"
  } else if above < 0.65 {
    "C"
  } else {
    "D"
  }
}

///|
/// Smallest change of the score, in points, that counts as momentum.
pub const MOMENTUM_MIN_CHANGE : Double = 10.0

///|
/// Smallest change of the score, as a share of its value 30 days ago, that
/// counts as momentum.
pub const MOMENTUM_MIN_RATIO : Double = 0.1

///|
/// The momentum label from the score now and 30 days ago. With the change
/// G = score - score_30d_ago:
///
/// - `New`: the package had no release 30 days ago (`score_30d_ago` is
///   `None`).
/// - `Rising`: G >= `MOMENTUM_MIN_CHANGE` and G >= `MOMENTUM_MIN_RATIO` times
///   the earlier score.
/// - `Cooling`: -G meets the same two thresholds.
/// - `Stable`: otherwise, including any `NaN` score.
///
/// Both thresholds must hold, so a large package needs a large change and a
/// small one cannot cross a label with a handful of points.
pub fn compute_momentum_label(
  score : Double,
  score_30d_ago : Double?,
) -> String {
  guard score_30d_ago is Some(past) else { return "New" }
  let change = score - past
  let threshold = if MOMENTUM_MIN_RATIO * past > MOMENTUM_MIN_CHANGE {
    MOMENTUM_MIN_RATIO * past
  } else {
    MOMENTUM_MIN_CHANGE
  }
  if change >= threshold {
    "Rising"
  } else if change <= -threshold {
    "Cooling"
  } else {
    "Stable"
  }
}

///|
/// The full result of scoring one package within a population.
pub struct ScoreSnapshot {
  score : Double
  score_30d_ago : Double
  score_growth_30d : Double
  score_growth_ratio_30d : Double
  rank_label : String
  rank_position : Int
  momentum_label : String
  activity_multiplier : Double
  breakdown : ScoreBreakdown
} derive(ToJson, FromJson, Debug)

///|
/// Scores a whole population. `current[i]` holds the signals of package `i`
/// now; `past[i]` holds them 30 days ago, or `None` when the package had no
/// release then. Rank positions and labels are relative to the population.
pub fn score_population(
  current : ArrayView[Signals],
  past : ArrayView[Signals?],
) -> Array[ScoreSnapshot] {
  let n = current.length()
  let scores = Array::makei(n, i => compute_score(current[i]))
  let positions = rank_positions(scores[:])
  Array::makei(n, i => {
    let score = scores[i]
    let previous = if i < past.length() {
      past[i].map(compute_score)
    } else {
      None
    }
    let score_30d_ago = previous.unwrap_or(0.0)
    let growth = score - score_30d_ago
    let ratio = if score_30d_ago > 0.0 {
      growth / score_30d_ago
    } else if growth > 0.0 {
      1.0
    } else {
      0.0
    }
    {
      score,
      score_30d_ago,
      score_growth_30d: growth,
      score_growth_ratio_30d: ratio,
      rank_label: rank_label(positions[i], n, score),
      rank_position: positions[i],
      momentum_label: compute_momentum_label(score, previous),
      activity_multiplier: activity_multiplier(current[i].days_since_release),
      breakdown: score_breakdown(current[i]),
    }
  })
}
