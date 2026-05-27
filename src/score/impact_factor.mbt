///|
pub fn clamp_non_negative(value : Int) -> Int {
  if value < 0 {
    0
  } else {
    value
  }
}

///|
fn activity_multiplier(days_since_release : Int) -> Double {
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
