# metrics design

The `metrics` package turns the registry index into the signals of the
[score](score.md): it decides which release of a package is the latest,
which dependencies are current, who counts as a dependent, which
dependents are recent, and what all of this looked like 30 days ago. This
page defines those notions precisely and explains why they were chosen. The
[metrics API](../api/metrics.md) lists the types and functions.

## Design goal

Every decision that changes a score must be made in one place, in MoonBit,
and be testable without a database, a network or a clock. The index builder
(`scripts/build_index.py`) only reads files, fetches download counts and
writes SQLite; it hands everything to `compute` and stores the `Report`
unchanged.

## Mathematical background

### Releases and time

The input is a set of releases $\rho = (p, v, c, \Delta, y)$: package name
$p$, version $v$, publication time $c$ (milliseconds since the Unix epoch,
or $\bot$ when the index has no valid date), the set $\Delta$ of declared
dependency names, and the yanked flag $y$. Undated releases count as older
than every dated one: for a time limit $\tau$,

$$
\text{published}(\rho, \tau) \iff c = \bot \ \lor\ c \le \tau .
$$

Releases are ordered by $(c, v)$, with $\bot$ below every date and versions
compared by Semantic Versioning 2.0.0 precedence (core numbers numerically,
a release above its pre-releases, pre-release identifiers one by one,
build metadata ignored). Numeric identifiers are compared by length and then
digit by digit, so versions with very large numbers order correctly without
overflow.

### The latest release

For a package $p$ and a limit $\tau$, the latest release is

$$
L_p(\tau) = \max_{(c, v)} \{\, \rho \text{ of } p : \text{published}(\rho, \tau),\ \lnot y \,\},
$$

the newest non-yanked release published by $\tau$. When every published
release is yanked, the newest yanked one is reported as the package's
version (so that its page shows something), but it contributes no
dependencies.

### Current dependency edges

There is an edge $q \to p$ at time $\tau$ when the latest release of $q$
declares $p$:

$$
q \to_\tau p \iff p \in \Delta\bigl(L_q(\tau)\bigr),\ p \ne q,\ p \text{ is in the registry}.
$$

Its first appearance is the earliest non-yanked release of $q$ published by
$\tau$ that declares $p$:

$$
f_\tau(q, p) = \min \{\, c(\rho) : \rho \text{ of } q,\ \text{published}(\rho, \tau),\ \lnot y,\ p \in \Delta(\rho) \,\},
$$

which is $\bot$ when that release is undated. An edge is *recent* at $\tau$
when $\tau - 180\,\text{d} < f_\tau(q, p) \le \tau$; an undated first
appearance is never recent. The edge belongs to the same owner when the
parts of $q$ and $p$ before the first `/` are equal.

### Signals of a package

From the edges into $p$ at $\tau$:

$$
\begin{aligned}
E_p(\tau) &= \#\{\, q \to_\tau p : \text{owner}(q) \ne \text{owner}(p) \,\}, &
O_p(\tau) &= \#\{\, q \to_\tau p : \text{owner}(q) = \text{owner}(p) \,\}, \\
E^r_p(\tau) &= \#\{\, \text{external and recent} \,\}, &
O^r_p(\tau) &= \#\{\, \text{same owner and recent} \,\},
\end{aligned}
$$

the number of distinct external owners, and the release age
$t_p(\tau) = \lfloor (\tau - c(L_p(\tau))) / 1\,\text{d} \rfloor$ (or
$3650$ days when the date is unknown).

### Two points in time

`compute` evaluates the signals at $\tau_0$, the `now` of the input, and at
$\tau_{30} = \tau_0 - 30\,\text{d}$. A package that had no published
release at $\tau_{30}$ has no earlier signals, and the score calls it
`New`.

Downloads are the exception, because the registry index has no history of
them. The input carries a list of earlier download snapshots; `compute`
picks the one closest to $\tau_{30}$ within $7$ days. With such a snapshot,

$$
W_p(\tau_{30}) = \min\bigl(W_p^{\text{snapshot}},\ W_p(\tau_0)\bigr),
$$

since a cumulative count cannot fall. Without one, $W_p(\tau_{30}) =
W_p(\tau_0)$: downloads then add no change, and the momentum depends only on
dependents and release age. The report states which case applied
(`download_history_used`).

## Design decisions

### Latest release only

**Problem.** A package's dependencies change between releases. Counting
every dependency ever declared credits packages that were dropped long ago.

**Choice.** Only the dependencies of the latest non-yanked release form
edges. This is the dependency set a user installs today. The first
appearance still looks at earlier releases, so a long-standing dependency is
not mistaken for a recent one after every release.

### Yanked releases

A yanked release was withdrawn by its author. It is not the latest release
and declares nothing, but it still counts in `version_count` and appears in
the release list (marked), because it was published.

### Undated releases

About $130$ of $17\,456$ index records have no date. Treating them as
oldest keeps them out of every recent window and out of the 30-day
comparison, the conservative choice for signals that reward recency.

### History by snapshot distance, not by exact date

**Problem.** The daily build may skip days or run at different hours.

**Choice.** Accept the snapshot nearest to $\tau_{30}$ within a week. A
comparison over $23$ to $37$ days changes the momentum threshold by little,
and a missing day does not switch the download term off.

### One computation for the whole registry

Positions and grades are relative to the registry, so the score of one
package can no longer be computed alone. `compute` takes all releases at
once, which also replaced the process per package of version 0.1 by one
process per build (about one second for $2902$ packages and $17\,456$
releases).

## Correctness / invariants

- **Determinism.** `compute` is a pure function of its `Input`; packages
  are processed in code-unit order of their names, so the report is the
  same byte for byte for the same input.
- **Edges.** Every edge connects two packages of the input, has
  `source != target`, and appears once.
- **Counts.** `dependents = external_dependents + self_dependents`,
  `recent_dependents ≤ dependents`, and `dependent_owners ≤
  external_dependents`.
- **Earlier signals.** The 30-days-ago signals use only releases published
  by then, so a package published later has `signals_30d_ago = None` and the
  label `New`.
- **Timestamps.** `parse_timestamp` accepts RFC 3339 with a `Z` or a
  `±hh:mm` offset and an optional fraction (truncated to milliseconds),
  rejects impossible dates such as 29 February 2026, and
  `format_timestamp` writes UTC with milliseconds; for whole milliseconds the
  two are inverse.

## Alternatives rejected

- **Dependents across all releases** (version 0.1): rewards history over
  current use, see above.
- **Version requirements** were not interpreted: a dependent counts whatever
  version range it asks for. Interpreting ranges would need a resolver and
  says little about reliance.
- **Downloads from a third-party archive** would give a history at once but
  add a dependency on a service outside the registry.

## Boundaries

- Path and Git dependencies count when their name is a registry package;
  the registry only records the name.
- `bin-deps` (tools used at build time) are not dependencies.
- The package does not read files, fetch downloads or know the current time;
  the index builder supplies all of them.
