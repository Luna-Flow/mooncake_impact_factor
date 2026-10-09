///|
test "parse_timestamp reads RFC 3339" {
  debug_inspect(
    @metrics.parse_timestamp("1970-01-01T00:00:00Z"),
    content="Some(0)",
  )
  debug_inspect(
    @metrics.parse_timestamp("2026-09-30T15:52:04.965858+00:00"),
    content="Some(1790783524965)",
  )
  // The same instant written with an offset.
  debug_inspect(
    @metrics.parse_timestamp("2026-10-01T00:52:04.965+09:00"),
    content="Some(1790783524965)",
  )
  debug_inspect(
    @metrics.parse_timestamp("2026-02-29T00:00:00Z"),
    content="None",
  )
  debug_inspect(
    @metrics.parse_timestamp("2024-02-29T00:00:00Z") is Some(_),
    content="true",
  )
  debug_inspect(@metrics.parse_timestamp("yesterday"), content="None")
  debug_inspect(@metrics.parse_timestamp("2026-09-30T15:52:04"), content="None")
}

///|
test "format_timestamp is the inverse for whole milliseconds" {
  let t = @metrics.parse_timestamp("2026-09-30T15:52:04.965+00:00").unwrap()
  inspect(@metrics.format_timestamp(t), content="2026-09-30T15:52:04.965Z")
  inspect(@metrics.format_timestamp(-1L), content="1969-12-31T23:59:59.999Z")
  inspect(@metrics.days_between(0L, -1L), content="-1")
}

///|
test "compare_versions follows SemVer precedence" {
  inspect(@metrics.compare_versions("1.10.0", "1.9.0"), content="1")
  inspect(@metrics.compare_versions("1.0.0", "1.0.0-rc.1"), content="1")
  inspect(@metrics.compare_versions("0.0.2-a2", "0.0.2-a3"), content="-1")
  inspect(
    @metrics.compare_versions("1.0.0-alpha", "1.0.0-alpha.1"),
    content="-1",
  )
  inspect(
    @metrics.compare_versions("1.0.0-alpha.2", "1.0.0-alpha.10"),
    content="-1",
  )
  inspect(@metrics.compare_versions("1.0.0-1", "1.0.0-alpha"), content="-1")
  inspect(@metrics.compare_versions("1.0.0+build.5", "1.0.0"), content="0")
  inspect(
    @metrics.compare_versions("99999999999999999999.0.0", "2.0.0"),
    content="1",
  )
}

///|
fn release(
  name : String,
  version : String,
  at : String,
  deps? : Array[String] = [],
  yanked? : Bool = false,
) -> @metrics.Release {
  { name, version, created_at: Some(at), deps, yanked, }
}

///|
fn find(report : @metrics.Report, name : String) -> @metrics.PackageReport {
  report.packages.filter(p => p.name == name)[0]
}

///|
test "dependents come from the latest release only" {
  let input : @metrics.Input = {
    now: "2026-10-01T00:00:00Z",
    releases: [
      release("a/lib", "1.0.0", "2025-01-01T00:00:00Z"),
      // b used to depend on a/lib and dropped it.
      release("b/app", "1.0.0", "2025-02-01T00:00:00Z", deps=["a/lib"]),
      release("b/app", "2.0.0", "2025-03-01T00:00:00Z"),
      // c depends on a/lib; its newest release is yanked and does not count.
      release("c/app", "1.0.0", "2025-04-01T00:00:00Z", deps=["a/lib"]),
      release("c/app", "1.1.0", "2025-05-01T00:00:00Z", yanked=true),
      // Same owner, recent.
      release("a/tool", "0.1.0", "2026-09-15T00:00:00Z", deps=[
        "a/lib", "x/unknown",
      ]),
    ],
    downloads: { "a/lib": 100 },
    download_history: [],
  }
  let report = @metrics.compute(input)
  let lib = find(report, "a/lib")
  inspect(lib.external_dependents, content="1")
  inspect(lib.self_dependents, content="1")
  inspect(lib.dependent_owners, content="1")
  inspect(lib.recent_dependents, content="1")
  debug_inspect(lib.latest_version, content="Some(\"1.0.0\")")
  debug_inspect(
    find(report, "b/app").versions,
    content=(
      #|["2.0.0", "1.0.0"]
    ),
  )
  // c/app's latest release is yanked; the latest non-yanked one is shown.
  debug_inspect(find(report, "c/app").latest_version, content="Some(\"1.0.0\")")
  inspect(report.edges.length(), content="2")
  inspect(report.population, content="4")
  debug_inspect(report.momentum_counts.get("New"), content="Some(1)")
  // a/tool was published 30 days ago or later.
  inspect(find(report, "a/tool").snapshot.momentum_label, content="New")
  // Without download history, downloads 30 days ago are unknown.
  debug_inspect(lib.downloads_30d_ago, content="None")
  debug_inspect(lib.signals_30d_ago.map(s => s.downloads), content="Some(100)")
}

///|
test "the 30-days-ago snapshot sees only earlier releases" {
  let input : @metrics.Input = {
    now: "2026-10-01T00:00:00Z",
    releases: [
      release("a/lib", "1.0.0", "2026-01-01T00:00:00Z"),
      release("b/app", "1.0.0", "2026-09-20T00:00:00Z", deps=["a/lib"]),
      release("c/app", "1.0.0", "2026-08-01T00:00:00Z", deps=["a/lib"]),
    ],
    downloads: { "a/lib": 500 },
    download_history: [
      { taken_at: "2026-09-02T00:00:00Z", counts: { "a/lib": 300 }, },
      { taken_at: "2026-08-01T00:00:00Z", counts: { "a/lib": 100 }, },
    ],
  }
  let report = @metrics.compute(input)
  let lib = find(report, "a/lib")
  inspect(report.download_history_used, content="true")
  debug_inspect(lib.downloads_30d_ago, content="Some(300)")
  let past = lib.signals_30d_ago.unwrap()
  inspect(past.external_dependents, content="1")
  inspect(lib.signals.external_dependents, content="2")
  inspect(past.days_since_release, content="243")
  inspect(lib.snapshot.score > lib.snapshot.score_30d_ago, content="true")
}

///|
test "an invalid now is an error" {
  let input : @metrics.Input = {
    now: "soon",
    releases: [],
    downloads: {},
    download_history: [],
  }
  try @metrics.compute(input) catch {
    e => inspect(e, content="invalid timestamp for now: soon")
  } noraise {
    _ => fail("expected compute to raise")
  }
}
