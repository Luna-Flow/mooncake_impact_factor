///|
fn signals(
  external? : Int = 0,
  self_owned? : Int = 0,
  recent_external? : Int = 0,
  recent_self? : Int = 0,
  downloads? : Int = 0,
  days? : Int = 100,
) -> @score.Signals {
  {
    external_dependents: external,
    self_dependents: self_owned,
    recent_external_dependents: recent_external,
    recent_self_dependents: recent_self,
    downloads,
    days_since_release: days,
  }
}

///|
test "ln matches known values" {
  inspect(@score.ln(1.0), content="0")
  inspect(@score.ln(2.0), content="0.6931471805599453")
  inspect(@score.ln(10.0), content="2.302585092994046")
  inspect(@score.ln(0.0), content="-Infinity")
  inspect(@score.ln(-1.0).is_nan(), content="true")
  inspect(@score.ln(@double.infinity), content="Infinity")
  // Subnormal input.
  inspect(@score.ln(5.0e-324), content="-744.4400719213812")
}

///|
test "more dependents raise the score" {
  let smaller = @score.compute_score(signals(external=5, downloads=200))
  let larger = @score.compute_score(signals(external=25, downloads=200))
  inspect(larger > smaller, content="true")
}

///|
test "dependents of the same owner count a quarter" {
  let own = @score.compute_score(signals(self_owned=8))
  let external = @score.compute_score(signals(external=2))
  inspect(own == external, content="true")
  inspect(@score.weighted_dependents(3, 4), content="4")
}

///|
test "the multiplier is continuous and bounded" {
  inspect(@score.activity_multiplier(-3), content="1.12")
  inspect(@score.activity_multiplier(30), content="1.12")
  inspect(@score.activity_multiplier(31) < 1.12, content="true")
  inspect(@score.activity_multiplier(365), content="0.88")
  inspect(@score.activity_multiplier(9999), content="0.88")
  // The halfway point between 30 and 365 days is 1.0.
  inspect(@score.activity_multiplier(197) - 1.0 < 1.0e-3, content="true")
}

///|
test "the breakdown adds up to the score" {
  let s = signals(external=20, self_owned=4, recent_external=3, downloads=300)
  let parts = @score.score_breakdown(s)
  let total = (parts.dependents + parts.recent_dependents + parts.downloads) *
    parts.multiplier
  inspect(total == @score.compute_score(s), content="true")
  inspect(@score.compute_score(signals()), content="0")
}

///|
test "rank positions share ties" {
  let positions = @score.rank_positions([5.0, 9.0, 5.0, 1.0, 0.0 / 0.0][:])
  debug_inspect(positions, content="[2, 1, 2, 4, 5]")
}

///|
test "rank labels follow the population shares" {
  inspect(@score.rank_label(1, 100, 50.0), content="S")
  inspect(@score.rank_label(5, 100, 50.0), content="S")
  inspect(@score.rank_label(6, 100, 50.0), content="A")
  inspect(@score.rank_label(16, 100, 50.0), content="B")
  inspect(@score.rank_label(36, 100, 50.0), content="C")
  inspect(@score.rank_label(66, 100, 50.0), content="D")
  // No signal at all is always D.
  inspect(@score.rank_label(1, 100, 0.0), content="D")
}

///|
test "momentum labels" {
  inspect(@score.compute_momentum_label(50.0, None), content="New")
  inspect(@score.compute_momentum_label(120.0, Some(100.0)), content="Rising")
  // Ten points, but less than 10% of a large score.
  inspect(@score.compute_momentum_label(415.0, Some(400.0)), content="Stable")
  inspect(@score.compute_momentum_label(85.0, Some(100.0)), content="Cooling")
  // Fifteen points, but less than 10% of a large score.
  inspect(@score.compute_momentum_label(455.0, Some(470.0)), content="Stable")
  inspect(@score.compute_momentum_label(0.0 / 0.0, Some(1.0)), content="Stable")
  inspect(@score.compute_momentum_label(102.0, Some(100.0)), content="Stable")
}

///|
test "score_population ranks and compares" {
  let current = [
    signals(external=10, recent_external=4, downloads=1000, days=10),
    signals(external=1, downloads=10),
    signals(),
  ]
  let past = [
    Some(signals(external=6, downloads=1000, days=40)),
    Some(signals(external=1, downloads=10)),
    None,
  ]
  let snapshots = @score.score_population(current[:], past[:])
  debug_inspect(snapshots.map(s => s.rank_position), content="[1, 2, 3]")
  debug_inspect(
    snapshots.map(s => s.momentum_label),
    content=(
      #|["Rising", "Stable", "New"]
    ),
  )
  inspect(snapshots[2].rank_label, content="D")
  inspect(snapshots[2].score_growth_ratio_30d, content="0")
  inspect(snapshots[1].score_growth_30d, content="0")
}

///|
test "labels come from one list" {
  let all = @score.momentum_labels()
  for s in [None, Some(100.0), Some(50.0), Some(200.0)] {
    let label = @score.compute_momentum_label(120.0, s)
    inspect(all.contains(label), content="true")
  }
  let grades = @score.rank_labels()
  for position in [1, 10, 30, 60, 90] {
    inspect(
      grades.contains(@score.rank_label(position, 100, 1.0)),
      content="true",
    )
  }
}
