# score design

This page derives the properties of the scoring model in
[`src/score/impact_factor.mbt`](../../../src/score/impact_factor.mbt) and
explains why it has this shape. The [score API](../api/score.md) lists the
functions; the [metrics design](metrics.md) explains where the signals come
from.

## Design goal

The score must order the packages of a registry snapshot by how much the
ecosystem relies on them, from signals that the public registry index
provides. It must be cheap, deterministic and explainable: a reader of a
package page should be able to see why one package outranks another, and the
same signals must give the same score on every MoonBit backend.

The model borrows its vocabulary from bibliometrics. A dependency is a
citation: a deliberate decision by another author to build on this work. The
journal impact factor counts citations, discounts self-citations and reports
a journal's place within its field by quartile; the score does the same with
dependents, dependents of the same owner, and grades.

## Mathematical background

### Signals

For a package $p$ at time $\tau$ the [metrics package](metrics.md)
measures:

| Symbol | Meaning |
| --- | --- |
| $E$ | external dependents: packages of *other* owners whose latest release depends on $p$ |
| $O$ | dependents of the *same* owner |
| $E_r$, $O_r$ | the dependents among $E$ and $O$ whose dependency first appeared in the 180 days before $\tau$ |
| $W$ | downloads reported by mooncakes.io |
| $t$ | whole days since the latest release ($3650$ when unknown) |

### The score

With the self-dependent weight $\lambda = 1/4$, write

$$
D = E + \lambda O, \qquad R = E_r + \lambda O_r, \qquad
\sigma(x) = \ln(1 + x) \ \ (x \ge 0).
$$

The score is

$$
S = m(t)\,\bigl(\underbrace{38\,\sigma(D)}_{P_D} + \underbrace{27\,\sigma(R)}_{P_R} + \underbrace{22\,\sigma(W)}_{P_W}\bigr),
$$

where the release-recency multiplier is the continuous, piecewise linear
function

$$
m(t) =
\begin{cases}
1.12 & t \le 30, \\[2pt]
1.12 - 0.24\,\dfrac{t - 30}{335} & 30 < t < 365, \\[6pt]
0.88 & t \ge 365,
\end{cases}
$$

with negative $t$ treated as $0$. `score_breakdown` returns $P_D$, $P_R$,
$P_W$ and $m(t)$, so that $S = (P_D + P_R + P_W)\,m(t)$ exactly as computed.

### A logarithmic index

Because $\ln a + \ln b = \ln ab$, the bracket is the logarithm of a weighted
product:

$$
38\,\sigma(D) + 27\,\sigma(R) + 22\,\sigma(W) = \ln\bigl((1+D)^{38}\,(1+R)^{27}\,(1+W)^{22}\bigr).
$$

The product is a Cobb–Douglas index of the shifted counts and the weights are
its elasticities. Two consequences follow.

**Doubling adds a constant.** Since $\sigma(2x + 1) = \ln 2 + \sigma(x)$,
doubling $1 + D$ adds $38 \ln 2 \approx 26.34$ points whatever $D$ was:
going from 10 to 21 dependents is worth as much as going from 1000 to 2001.

**Diminishing returns.** One more external dependent adds

$$
38\,\bigl(\sigma(D + 1) - \sigma(D)\bigr) = 38 \ln\frac{D + 2}{D + 1} \le \frac{38}{D + 1}
$$

points (by $\ln(1 + x) \le x$), so the marginal value of a dependent falls
like $1/D$, and inflating any one count buys little: multiplying $1 + W$ by
ten adds exactly $22 \ln 10 \approx 50.66$ points.

### Same-owner dependents

A same-owner dependent counts $\lambda = 1/4$ of an external one, inside the
logarithm. An owner who publishes $k$ packages that all depend on $p$ adds
$38\,\sigma(k/4)$ points instead of $38\,\sigma(k)$; for large $k$ the
difference tends to

$$
38\,\bigl(\ln(1 + k) - \ln(1 + k/4)\bigr) \to 38 \ln 4 \approx 52.68,
$$

the value of two doublings. Splitting a project into many packages therefore
cannot replace adoption by other people: in the registry snapshot of
11 June 2026, 738 of the 1548 dependency edges of version 0.1 (48 %)
connected packages of one owner, and the package with the most dependents
after `moonbitlang/x` and `moonbitlang/async` had only same-owner
dependents.

### Grades

Let $S_1, \dots, S_N$ be the scores of the $N$ packages of the registry. The
competition position of package $i$ is

$$
\pi_i = 1 + \#\{\, j : S_j > S_i \,\},
$$

so equal scores share a position, and the share of packages that score
strictly higher is $q_i = (\pi_i - 1)/N$. The grade is

$$
\text{grade}_i =
\begin{cases}
\texttt{D} & S_i \le 0 \text{ or } S_i \text{ is NaN}, \\
\texttt{S} & q_i < 0.05, \\
\texttt{A} & 0.05 \le q_i < 0.15, \\
\texttt{B} & 0.15 \le q_i < 0.35, \\
\texttt{C} & 0.35 \le q_i < 0.65, \\
\texttt{D} & q_i \ge 0.65.
\end{cases}
$$

Without ties exactly $\lceil 0.05 N \rceil$ packages are `S`; ties at a
boundary all take the better grade, because $q$ counts only strictly higher
scores. In the snapshot of 9 October 2026 ($N = 2902$) the grades split
$146 / 290 / 580 / 876 / 1010$.

### Momentum

The [metrics package](metrics.md) evaluates the signals a second time as
they were $30$ days earlier, from the releases and dependency declarations
published by then, giving $S_{30}$, or nothing when the package had no
release yet. With the change $G = S - S_{30}$ and the threshold

$$
\theta = \max\bigl(10,\ 0.1\,S_{30}\bigr),
$$

the label is

$$
\text{momentum} =
\begin{cases}
\texttt{New} & S_{30} \text{ undefined}, \\
\texttt{Rising} & G \ge \theta, \\
\texttt{Cooling} & G \le -\theta, \\
\texttt{Stable} & \text{otherwise (including NaN)}.
\end{cases}
$$

The two bounds of $\theta$ cover each other's blind spot. The absolute bound
stops small packages from changing label on noise: a package that goes from
one download to three gains $22\,(\ln 4 - \ln 2) \approx 15.2$ points times
$m$, a ratio of $100\,\%$ but a change near the bound. The relative bound
stops large packages from changing label on a small fraction: at
$S_{30} = 780$, a change of $12$ points is $1.5\,\%$. The ratio
$r = G / S_{30}$ is stored as `score_growth_ratio_30d`, with $1$ for a
package whose earlier score was $0$ and that grew, and $0$ otherwise.

**Ageing alone never changes the label.** Over $30$ days the multiplier
falls by at most $0.24 \cdot 30 / 335 \approx 0.0215$, a relative change of
at most $0.0215 / 0.88 \approx 2.4\,\%$, below the $10\,\%$ bound. The step
function of version 0.1 fell by up to $6.4\,\%$ in one day and made every
package crossing $90$, $180$ or $365$ days look like it was declining.

### A logarithm that is the same everywhere

`ln` ports the FreeBSD msun `e_log.c`: $x = 2^k (1 + f)$ with
$\sqrt2/2 \le 1 + f < \sqrt2$, then with $s = f / (2 + f)$

$$
\ln(1 + f) = 2s + \tfrac23 s^3 + \tfrac25 s^5 + \cdots
= f - s\,\bigl(f - R(s^2)\bigr),
$$

where $R$ is a degree-7 polynomial in $s^2$ fitted by Remez, and
$k \ln 2$ is added in two parts ($\ln 2_{\text{hi}}$ with a short
significand, so that $k \ln 2_{\text{hi}}$ is exact, and the correction
$\ln 2_{\text{lo}}$). It uses only IEEE 754 additions, multiplications,
divisions and bit manipulation, which every backend rounds the same way, so
the result has the same bits on js, wasm, wasm-gc and native. On $133\,225$
inputs (all integers up to $30\,000$ and a geometric sweep from $10^{-310}$
to $10^{300}$) the three tested backends agreed bit for bit, and $415$
results ($0.31\,\%$) differed from the correctly rounded value, each by one
unit in the last place, matching fdlibm's documented bound of $1$ ulp.

## Design decisions

### Dependents of the latest release

**Problem.** Version 0.1 counted every package that had *ever* declared a
dependency on $p$ in *any* release. A package that replaced a dependency
kept crediting the old one forever.

**Choice.** Only the latest non-yanked release counts. In the snapshot of
9 October 2026, `myfreess/sqlite3` lost 11 dependents that moved to
`moonbit-community/sqlite3`; the first now shows as `Cooling` and the second
as `Rising`, which is what happened. Yanked releases neither count as the
latest release nor contribute dependencies, because their authors withdrew
them.

### Discount, not exclusion, of the same owner

**Problem.** Same-owner dependents are often real reuse (a parser used by
the author's formatter), but they are also free to create.

**Options.** Count them fully (version 0.1); exclude them, like the impact
factor without self-citations; count distinct owners only; discount them.

**Choice.** A discount of $1/4$. Excluding them would make an author's own
toolkit of tightly coupled packages look unused; counting only distinct
owners would erase the difference between one package and fifty from the
same external owner. The package page reports $E$, $O$ and the number of
distinct external owners so that a reader can apply a stricter rule.

### Relative grades

**Problem.** Version 0.1 graded by fixed thresholds on $S$ ($260$, $180$,
$110$, $50$). The thresholds were chosen for one registry size; as the
registry and the download counts grew, `S` stopped meaning "exceptional"
and the share of each grade drifted with every snapshot.

**Choice.** Shares of the registry, like journal quartiles. A grade now
answers the reader's question, "how does this package compare with the rest
of the registry?", and keeps its meaning as the registry grows. The score
itself stays absolute: it does not depend on other packages, so it can be
compared across snapshots, while positions and grades are relative. Shares
of $5$, $10$, $20$, $30$ and $35\,\%$ grow towards the bottom because the
bottom of the registry is dense with packages that nobody uses yet; packages
with no signal at all are always `D`.

### A continuous multiplier

**Problem.** The step multiplier of version 0.1 moved a score by up to
$6.4\,\%$ overnight when a package crossed a step, which the momentum then
reported as a decline.

**Choice.** The same bounds, $1.12$ and $0.88$, joined linearly between $30$
and $365$ days. The bounds keep the earlier guarantees: the multiplier
changes a score by at most $\pm 12\,\%$, the freshest and the oldest
package with the same signals differ by the factor $1.12 / 0.88 \approx 1.27$,
and an unused package stays at $0$.

### Momentum from the past signals, not from a stored score

**Problem.** Comparing with the score computed 30 days ago would need a
history of scores, and any change to the model would make the comparison
meaningless.

**Choice.** Recompute the score of 30 days ago with the current model from
the releases published by then. Version 0.1 did this for dependents but used
$0$ for the downloads of 30 days ago, so the whole download term counted as
growth and almost every popular package was `Rising`. The index builder now
keeps a short history of download counts; until a count from about 30 days
ago exists, the current count stands in for it and downloads add no change.

### Weights

The weights $38 : 27 : 22$ are unchanged from version 0.1. Dependents weigh
most because a dependency is a deliberate decision; downloads weigh least
because they also count automated builds and are missing for packages the
builder could not look up; recent dependents are counted *on top of* all
dependents, a bonus for current adoption rather than a separate population.
They are editorial choices of this project, not fitted parameters.

## Correctness / invariants

- **Monotonicity.** For fixed $t$, $S$ is non-decreasing in $E$, $O$,
  $E_r$, $O_r$ and $W$, and strictly increasing in each while the others
  are fixed, because $\sigma$ is strictly increasing, the weights are
  positive and $m(t) > 0$. $S$ is non-increasing in $t$.
- **Range.** $S \ge 0$, with $S = 0$ exactly when $D = R = W = 0$. Counts
  are `Int`, so $\sigma \le \ln 2^{31} \approx 21.49$ and
  $S \le 1.12 \cdot 87 \cdot 31 \ln 2 \approx 2093.7$.
- **Breakdown consistency.** `compute_score` is computed from
  `score_breakdown`, so the parts on a package page add up to the score
  exactly as stored.
- **Positions.** `rank_positions` sorts once ($O(N \log N)$) and assigns
  equal positions to equal scores; `NaN` sorts last. Positions are
  $1 \le \pi_i \le N$ and $\pi_i = 1$ for every package with the best score.
- **Labels are total.** Every function returns one of its labels for every
  input; `NaN` scores are `D` and `Stable`.
- **Snapshot consistency.** `score_population` derives every field of a
  `ScoreSnapshot` from the same two scores, so
  `score_growth_30d == score - score_30d_ago` exactly.

## Alternatives rejected

- **PageRank-style centrality** would reward being depended on by important
  packages, but it needs an iterative solver and a damping parameter and
  cannot be explained in a table on a package page.
- **Transitive dependents** count one downstream package through every path
  and favour low-level packages more than the logarithm can correct.
- **Quantile scores** instead of quantile grades would change a package's
  score whenever other packages appear; only the grade is relative.
- **Learning the weights** would need a labelled ranking that does not
  exist.

## Boundaries

- The score measures reliance inside one registry snapshot. It does not
  measure quality, correctness, security or maintenance effort.
- The package takes the signals as given; the [metrics design](metrics.md)
  defines them.
- Grades and positions depend on the population passed to
  `score_population`; scores do not.
- `ln` is reproducible across backends, but the native backend compiled by a
  C compiler that contracts `a*b+c` into fused multiply-adds (GCC by
  default on targets with FMA) can still differ in the last bit; Luna-Flow
  tracks this as a toolchain issue.
