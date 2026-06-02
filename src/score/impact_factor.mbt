///|
pub fn clamp_non_negative(value : Int) -> Int {
  if value < 0 {
    0
  } else {
    value
  }
}

///|
pub fn activity_multiplier(days_since_release : Int) -> Double {
  let days = clamp_non_negative(days_since_release)
  if days <= 30 {
    1.12
  } else if days <= 90 {
    1.06
  } else if days <= 180 {
    1.0
  } else if days <= 365 {
    0.94
  } else {
    0.88
  }
}

///|
fn log_signal(value : Int) -> Double {
  let safe = clamp_non_negative(value)
  @math.ln(Float::from_int(safe + 1).to_double())
}

///|
pub struct ScoreSnapshot {
  score : Double
  score_30d_ago : Double
  score_growth_30d : Double
  score_growth_ratio_30d : Double
  rank_label : String
  momentum_label : String
  activity_multiplier : Double
} derive(ToJson, FromJson, Debug)

///|
pub fn compute_score(
  dependents : Int,
  recent_dependents : Int,
  downloads : Int,
  days_since_release : Int,
) -> Double {
  let dep_signal = log_signal(dependents) * 38.0
  let recent_dep_signal = log_signal(recent_dependents) * 27.0
  let download_signal = log_signal(downloads) * 22.0
  let base = dep_signal + recent_dep_signal + download_signal
  base * activity_multiplier(days_since_release)
}

///|
pub fn rank_label(score : Double) -> String {
  if score >= 260.0 {
    "S"
  } else if score >= 180.0 {
    "A"
  } else if score >= 110.0 {
    "B"
  } else if score >= 50.0 {
    "C"
  } else {
    "D"
  }
}

///|
pub fn compute_momentum_label(
  score : Double,
  score_30d_ago : Double,
  growth_ratio : Double,
  recent_dependents : Int,
) -> String {
  let growth_abs = score - score_30d_ago
  if growth_abs >= 35.0 && growth_ratio >= 0.35 && recent_dependents >= 3 {
    "Rising"
  } else if growth_abs >= 18.0 && growth_ratio >= 0.18 && recent_dependents >= 2 {
    "Hot"
  } else {
    "Stable"
  }
}

///|
pub fn compute_score_snapshot(
  dependents : Int,
  recent_dependents : Int,
  downloads : Int,
  days_since_release : Int,
  historical_dependents : Int,
  historical_recent_dependents : Int,
  historical_downloads : Int,
  historical_days_since_release : Int,
) -> ScoreSnapshot {
  let score = compute_score(
    dependents, recent_dependents, downloads, days_since_release,
  )
  let score_30d_ago = compute_score(
    historical_dependents,
    historical_recent_dependents,
    historical_downloads,
    historical_days_since_release,
  )
  let score_growth_30d = score - score_30d_ago
  let score_growth_ratio_30d = if score_30d_ago > 0.0 {
    score_growth_30d / score_30d_ago
  } else if score_growth_30d > 0.0 {
    1.0
  } else {
    0.0
  }
  ScoreSnapshot::{
    score,
    score_30d_ago,
    score_growth_30d,
    score_growth_ratio_30d,
    rank_label: rank_label(score),
    momentum_label: compute_momentum_label(
      score, score_30d_ago, score_growth_ratio_30d, recent_dependents,
    ),
    activity_multiplier: activity_multiplier(days_since_release),
  }
}
