///|
test "more dependents raise score" {
  let smaller = @score.compute_score(5, 1, 200, 120)
  let larger = @score.compute_score(25, 4, 200, 120)
  @debug.assert_eq(larger > smaller, true)
}

///|
test "downloads contribute to score" {
  let smaller = @score.compute_score(5, 1, 10, 120)
  let larger = @score.compute_score(5, 1, 1000, 120)
  @debug.assert_eq(larger > smaller, true)
}

///|
test "fresh releases receive a mild bonus" {
  let recent = @score.compute_score(10, 2, 500, 20)
  let older = @score.compute_score(10, 2, 500, 500)
  @debug.assert_eq(recent > older, true)
}

///|
test "rank label is stable" {
  inspect(@score.rank_label(40.0), content="D")
  inspect(@score.rank_label(120.0), content="B")
  inspect(@score.rank_label(300.0), content="S")
}

///|
test "momentum label thresholds are stable" {
  inspect(@score.compute_momentum_label(140.0, 100.0, 0.4, 3), content="Rising")
  inspect(@score.compute_momentum_label(118.0, 100.0, 0.18, 2), content="Hot")
  inspect(
    @score.compute_momentum_label(105.0, 100.0, 0.05, 1),
    content="Stable",
  )
}

///|
test "score snapshot includes derived fields" {
  let snapshot = @score.compute_score_snapshot(20, 4, 300, 40, 10, 2, 0, 10)
  @debug.assert_eq(snapshot.score > snapshot.score_30d_ago, true)
  inspect(snapshot.rank_label, content="S")
  inspect(snapshot.momentum_label, content="Rising")
}

///|
test "historical downloads affect the baseline score" {
  let zero_history = @score.compute_score_snapshot(20, 4, 300, 40, 20, 4, 0, 10)
  let matched_history = @score.compute_score_snapshot(
    20, 4, 300, 40, 20, 4, 300, 10,
  )
  @debug.assert_eq(
    matched_history.score_30d_ago > zero_history.score_30d_ago,
    true,
  )
  @debug.assert_eq(
    zero_history.score_growth_30d > matched_history.score_growth_30d,
    true,
  )
}

///|
test "unreleased historical baseline stays at zero" {
  let snapshot = @score.compute_score_snapshot(8, 2, 120, 12, 0, 0, 0, 0)
  inspect(snapshot.score_30d_ago, content="0")
  inspect(snapshot.score_growth_ratio_30d, content="1")
}
