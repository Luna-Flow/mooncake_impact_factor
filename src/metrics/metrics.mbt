///|
/// Length of the window in which a new dependent counts as recent.
pub const RECENT_WINDOW_DAYS : Int = 180

///|
/// Distance between the two snapshots that the momentum compares.
pub const MOMENTUM_WINDOW_DAYS : Int = 30

///|
/// How far a download snapshot may be from the 30-days-ago point and still
/// stand for it.
pub const DOWNLOAD_HISTORY_TOLERANCE_DAYS : Int = 7

///|
/// One published version of a package, as listed in the registry index.
/// `deps` holds the names of the packages it declares as dependencies.
pub(all) struct Release {
  name : String
  version : String
  created_at : String?
  deps : Array[String]
  yanked : Bool
} derive(ToJson, FromJson, Debug, Eq)

///|
/// Download counts of every package at one moment.
pub(all) struct DownloadSnapshot {
  taken_at : String
  counts : Map[String, Int]
} derive(ToJson, FromJson, Debug, Eq)

///|
/// Everything the index builder hands to the computation.
pub(all) struct Input {
  now : String
  releases : Array[Release]
  downloads : Map[String, Int]
  download_history : Array[DownloadSnapshot]
} derive(ToJson, FromJson, Debug, Eq)

///|
/// A current dependency: the latest release of `source` declares `target`.
pub(all) struct Edge {
  source : String
  target : String
  first_seen_at : String?
  same_owner : Bool
} derive(ToJson, FromJson, Debug, Eq)

///|
/// The measured signals and the score of one package.
pub(all) struct PackageReport {
  name : String
  owner : String
  package_name : String
  latest_version : String?
  latest_created_at : String?
  version_count : Int
  /// Every published version, newest first: by release date, then by
  /// version precedence; undated releases come last.
  versions : Array[String]
  dependents : Int
  external_dependents : Int
  self_dependents : Int
  recent_dependents : Int
  dependent_owners : Int
  downloads : Int
  downloads_30d_ago : Int?
  days_since_release : Int
  signals : @score.Signals
  signals_30d_ago : @score.Signals?
  snapshot : @score.ScoreSnapshot
} derive(ToJson, FromJson, Debug)

///|
pub(all) struct Report {
  computed_at : String
  population : Int
  download_history_used : Bool
  /// Number of packages per rank label and per momentum label.
  rank_counts : Map[String, Int]
  momentum_counts : Map[String, Int]
  /// The best score of the registry, the scale of relative score bars.
  top_score : Double
  packages : Array[PackageReport]
  edges : Array[Edge]
} derive(ToJson, FromJson, Debug)

///|
/// Errors in the input that make the computation meaningless.
pub suberror MetricsError {
  InvalidNow(String)
} derive(Debug)

///|
pub impl Show for MetricsError with fn output(self, logger) {
  match self {
    InvalidNow(text) =>
      logger.write_string("invalid timestamp for now: \{text}")
  }
}

///|
/// The owner of `owner/package`, or the whole name when it has no slash.
pub fn owner_of(name : String) -> String {
  match name.find("/") {
    Some(i) => name.view(end_offset=i).to_owned()
    None => name
  }
}

///|
fn package_name_of(name : String) -> String {
  match name.find("/") {
    Some(i) => name.view(start_offset=i + 1).to_owned()
    None => name
  }
}

///|
/// A release with its parsed timestamp. `at` is `None` when the date is
/// missing or malformed; such a release counts as older than every dated one.
priv struct Dated {
  release : Release
  at : Int64?
}

///|
fn dated_before(at : Int64?, limit : Int64) -> Bool {
  match at {
    None => true
    Some(t) => t <= limit
  }
}

///|
/// Orders releases by date, then by version precedence.
fn compare_dated(a : Dated, b : Dated) -> Int {
  let by_time = match (a.at, b.at) {
    (None, None) => 0
    (None, Some(_)) => -1
    (Some(_), None) => 1
    (Some(x), Some(y)) => x.compare(y)
  }
  if by_time != 0 {
    by_time
  } else {
    compare_versions(a.release.version, b.release.version)
  }
}

///|
/// The latest release of a package that was published at `limit` or
/// earlier. Yanked releases are skipped unless every candidate is yanked
/// and `allow_yanked` is set.
fn latest_at(
  releases : Array[Dated],
  limit : Int64,
  allow_yanked~ : Bool,
) -> Dated? {
  let mut best : Dated? = None
  let mut best_yanked : Dated? = None
  for d in releases {
    if !dated_before(d.at, limit) {
      continue
    }
    if d.release.yanked {
      if best_yanked is Some(b) && compare_dated(d, b) <= 0 {
        continue
      }
      best_yanked = Some(d)
    } else {
      if best is Some(b) && compare_dated(d, b) <= 0 {
        continue
      }
      best = Some(d)
    }
  }
  match best {
    Some(_) => best
    None => if allow_yanked { best_yanked } else { None }
  }
}

///|
/// Signals of one package at one point in time, from the current edges.
priv struct Counts {
  mut external : Int
  mut self_owned : Int
  mut recent_external : Int
  mut recent_self : Int
  owners : Set[String]
}

///|
fn Counts::new() -> Counts {
  {
    external: 0,
    self_owned: 0,
    recent_external: 0,
    recent_self: 0,
    owners: Set([]),
  }
}

///|
priv struct EdgeInfo {
  source : String
  target : String
  first_seen : Int64?
}

///|
/// The current dependency edges at `limit`: for every package, the
/// dependencies of its latest non-yanked release published at `limit` or
/// earlier, with the date of the earliest non-yanked release that declared
/// each of them. Self-loops and dependencies outside the registry are
/// dropped.
fn edges_at(
  names : Array[String],
  by_name : Map[String, Array[Dated]],
  limit : Int64,
) -> Array[EdgeInfo] {
  let edges = []
  for name in names {
    let releases = by_name.get(name).unwrap_or([])
    guard latest_at(releases, limit, allow_yanked=false) is Some(latest) else {
      continue
    }
    let seen = Set([])
    for target in latest.release.deps {
      if target == name || !by_name.contains(target) || seen.contains(target) {
        continue
      }
      seen.add(target)
      let mut first : Int64? = None
      let mut first_known = false
      for d in releases {
        if d.release.yanked ||
          !dated_before(d.at, limit) ||
          !d.release.deps.contains(target) {
          continue
        }
        match d.at {
          None => {
            // An undated release is older than every dated one.
            first = None
            first_known = true
            break
          }
          Some(t) =>
            if !first_known {
              first = Some(t)
              first_known = true
            } else if first is Some(f) && t < f {
              first = Some(t)
            }
        }
      }
      edges.push({ source: name, target, first_seen: first, })
    }
  }
  edges
}

///|
fn count_edges(edges : Array[EdgeInfo], limit : Int64) -> Map[String, Counts] {
  let window_start = limit - RECENT_WINDOW_DAYS.to_int64() * MILLIS_PER_DAY
  let counts : Map[String, Counts] = Map([])
  for edge in edges {
    let c = match counts.get(edge.target) {
      Some(c) => c
      None => {
        let c = Counts::new()
        counts.set(edge.target, c)
        c
      }
    }
    let same = owner_of(edge.source) == owner_of(edge.target)
    let recent = match edge.first_seen {
      Some(t) => t > window_start && t <= limit
      None => false
    }
    if same {
      c.self_owned += 1
      if recent {
        c.recent_self += 1
      }
    } else {
      c.external += 1
      c.owners.add(owner_of(edge.source))
      if recent {
        c.recent_external += 1
      }
    }
  }
  counts
}

///|
/// Picks the download snapshot closest to `target` within the tolerance.
fn downloads_near(
  history : Array[DownloadSnapshot],
  target : Int64,
) -> DownloadSnapshot? {
  let tolerance = DOWNLOAD_HISTORY_TOLERANCE_DAYS.to_int64() * MILLIS_PER_DAY
  let mut best : DownloadSnapshot? = None
  let mut best_distance = 0L
  for snapshot in history {
    guard parse_timestamp(snapshot.taken_at) is Some(t) else { continue }
    let distance = if t >= target { t - target } else { target - t }
    if distance > tolerance {
      continue
    }
    if best is None || distance < best_distance {
      best = Some(snapshot)
      best_distance = distance
    }
  }
  best
}

///|
fn signals_of(
  counts : Counts?,
  downloads : Int,
  days_since_release : Int,
) -> @score.Signals {
  match counts {
    Some(c) =>
      {
        external_dependents: c.external,
        self_dependents: c.self_owned,
        recent_external_dependents: c.recent_external,
        recent_self_dependents: c.recent_self,
        downloads,
        days_since_release,
      }
    None =>
      {
        external_dependents: 0,
        self_dependents: 0,
        recent_external_dependents: 0,
        recent_self_dependents: 0,
        downloads,
        days_since_release,
      }
  }
}

///|
fn age_in_days(latest : Dated?, limit : Int64) -> Int {
  match latest {
    Some({ at: Some(t), .. }) =>
      @score.clamp_non_negative(days_between(t, limit))
    _ => @score.UNKNOWN_RELEASE_AGE_DAYS
  }
}

///|
fn newest_first(releases : Array[Dated]) -> Array[String] {
  let sorted = releases.copy()
  sorted.sort_by((a, b) => compare_dated(b, a))
  sorted.map(d => d.release.version)
}

///|
/// Computes the signals, the current dependency edges and the scores of
/// every package in the registry snapshot.
///
/// The 30-days-ago signals use only releases published by then. Download
/// counts 30 days ago come from the snapshot in `download_history` closest
/// to that point (within `DOWNLOAD_HISTORY_TOLERANCE_DAYS`); without one,
/// the current counts stand in for them, so downloads add no growth.
pub fn compute(input : Input) -> Report raise MetricsError {
  guard parse_timestamp(input.now) is Some(now) else {
    raise InvalidNow(input.now)
  }
  let past = now - MOMENTUM_WINDOW_DAYS.to_int64() * MILLIS_PER_DAY
  let by_name : Map[String, Array[Dated]] = Map([])
  for release in input.releases {
    let dated = { release, at: release.created_at.bind(parse_timestamp), }
    match by_name.get(release.name) {
      Some(list) => list.push(dated)
      None => by_name.set(release.name, [dated])
    }
  }
  let names = by_name.keys().collect()
  names.sort_by((a, b) => compare_text(a, b))
  let current_edges = edges_at(names, by_name, now)
  let past_edges = edges_at(names, by_name, past)
  let current_counts = count_edges(current_edges, now)
  let past_counts = count_edges(past_edges, past)
  let history = downloads_near(input.download_history, past)
  let current = []
  let previous = []
  let rows = []
  for name in names {
    let releases = by_name.get(name).unwrap_or([])
    let latest = latest_at(releases, now, allow_yanked=true)
    let latest_past = latest_at(releases, past, allow_yanked=true)
    let downloads = @score.clamp_non_negative(
      input.downloads.get(name).unwrap_or(0),
    )
    let downloads_past = match history {
      Some(snapshot) =>
        snapshot.counts
        .get(name)
        .map(value => {
          if value < downloads {
            @score.clamp_non_negative(value)
          } else {
            downloads
          }
        })
      None => None
    }
    let days = age_in_days(latest, now)
    let signals = signals_of(current_counts.get(name), downloads, days)
    let signals_past = match latest_past {
      None => None
      Some(_) =>
        Some(
          signals_of(
            past_counts.get(name),
            downloads_past.unwrap_or(downloads),
            age_in_days(latest_past, past),
          ),
        )
    }
    current.push(signals)
    previous.push(signals_past)
    rows.push((name, releases, latest, downloads, downloads_past, days))
  }
  let snapshots = @score.score_population(current[:], previous[:])
  let packages = []
  for i, row in rows {
    let (name, releases, latest, downloads, downloads_past, days) = row
    let counts = current_counts.get(name)
    let signals = current[i]
    packages.push({
      name,
      owner: owner_of(name),
      package_name: package_name_of(name),
      latest_version: latest.map(d => d.release.version),
      latest_created_at: latest.bind(d => d.release.created_at),
      version_count: releases.length(),
      versions: newest_first(releases),
      dependents: signals.external_dependents + signals.self_dependents,
      external_dependents: signals.external_dependents,
      self_dependents: signals.self_dependents,
      recent_dependents: signals.recent_external_dependents +
      signals.recent_self_dependents,
      dependent_owners: counts.map(c => c.owners.length()).unwrap_or(0),
      downloads,
      downloads_30d_ago: downloads_past,
      days_since_release: days,
      signals,
      signals_30d_ago: previous[i],
      snapshot: snapshots[i],
    })
  }
  let edges = current_edges.map(e => {
    source: e.source,
    target: e.target,
    first_seen_at: e.first_seen.map(format_timestamp),
    same_owner: owner_of(e.source) == owner_of(e.target),
  })
  let mut top_score = 0.0
  let rank_counts : Map[String, Int] = Map([])
  let momentum_counts : Map[String, Int] = Map([])
  for s in snapshots {
    if s.score > top_score {
      top_score = s.score
    }
    rank_counts.set(
      s.rank_label,
      rank_counts.get(s.rank_label).unwrap_or(0) + 1,
    )
    momentum_counts.set(
      s.momentum_label,
      momentum_counts.get(s.momentum_label).unwrap_or(0) + 1,
    )
  }
  {
    computed_at: format_timestamp(now),
    population: names.length(),
    download_history_used: history is Some(_),
    rank_counts,
    momentum_counts,
    top_score,
    packages,
    edges,
  }
}

///|
/// Compares two strings code unit by code unit.
pub fn compare_text(a : String, b : String) -> Int {
  let n = if a.length() < b.length() { a.length() } else { b.length() }
  for i in 0..<n {
    let c = a.code_unit_at(i).compare(b.code_unit_at(i))
    if c != 0 {
      return c
    }
  }
  a.length().compare(b.length())
}
