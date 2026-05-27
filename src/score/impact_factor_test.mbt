///|
test "more dependents raise score" {
  let smaller = compute_score(5, 1, 200, 120)
  let larger = compute_score(25, 4, 200, 120)
  @debug.assert_eq(larger > smaller, true)
}

///|
test "downloads contribute to score" {
  let smaller = compute_score(5, 1, 10, 120)
  let larger = compute_score(5, 1, 1000, 120)
  @debug.assert_eq(larger > smaller, true)
}

///|
test "fresh releases receive a mild bonus" {
  let recent = compute_score(10, 2, 500, 20)
  let older = compute_score(10, 2, 500, 500)
  @debug.assert_eq(recent > older, true)
}

///|
test "rank label is stable" {
  inspect(rank_label(40.0), content="D")
  inspect(rank_label(120.0), content="B")
  inspect(rank_label(300.0), content="S")
}
