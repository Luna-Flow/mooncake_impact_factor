# score design

This page derives the properties of the scoring model in
[`src/score/impact_factor.mbt`](../../../src/score/impact_factor.mbt) and
explains why it has this shape. The [score API](../api/score.md) lists the
functions; the [architecture guide](../architecture.md) shows where the index
builder gets the signals from.

## Design goal

The score must order the packages of a registry snapshot by how much the
ecosystem relies on them, from signals that a local registry index can
provide. It must be cheap, deterministic and explainable: a reader of the web
page should be able to see why one package outranks another, and the same
signals must give the same score in MoonBit, in the index builder and in the
browser.

## Mathematical background

### The score

Write $D$, $R$ and $W$ for the number of dependents, recent dependents and
downloads, and $t$ for the days since the latest release. The implementation
computes

$$
\sigma(n) = \ln\bigl(1 + \max(n, 0)\bigr), \qquad
B = 38\,\sigma(D) + 27\,\sigma(R) + 22\,\sigma(W), \qquad
S = m(t)\,B,
$$

where $B$ is the base score and $m$ is the step function

$$
m(t) =
\begin{cases}
1.12 & t \le 30 \\
1.06 & 30 < t \le 90 \\
1.00 & 90 < t \le 180 \\
0.94 & 180 < t \le 365 \\
0.88 & t > 365
\end{cases}
$$

with negative $t$ treated as $0$. Nothing else enters the score: there is no
normalisation against the rest of the registry, so a package's score does not
change when other packages are added.

### A logarithmic index

Because $\ln a + \ln b = \ln ab$, the base score is the logarithm of a weighted
product:

$$
\begin{aligned}
B &= 38\ln(1+D) + 27\ln(1+R) + 22\ln(1+W) \\
  &= \ln\bigl((1+D)^{38}\,(1+R)^{27}\,(1+W)^{22}\bigr).
\end{aligned}
$$

The product $(1+D)^{38}(1+R)^{27}(1+W)^{22}$ is a Cobb–Douglas index[^cd] of
the shifted counts, and the weights are its elasticities:
$\partial B / \partial \ln(1+D) = 38$. Two consequences follow directly.

[^cd]: The Cobb–Douglas form $\prod_i x_i^{\alpha_i}$ comes from production
    economics (Cobb and Douglas, 1928). Its logarithm is linear in
    $\ln x_i$, which is why ranking by $B$ is the same as ranking by the
    weighted geometric mean of the shifted counts.

**Doubling adds a constant.** Since $\sigma(2n+1) = \ln(2n+2) = \ln 2 +
\sigma(n)$, doubling $1 + D$ adds $38\ln 2 \approx 26.34$ points to $B$,
whatever $D$ was. The same step is worth $27\ln 2 \approx 18.71$ points for
recent dependents and $22\ln 2 \approx 15.25$ for downloads. A package with
1000 dependents gains as much from the next 1001 as a package with 10 gains
from the next 11.

**Diminishing returns.** One more dependent adds

$$
38\bigl(\sigma(D+1) - \sigma(D)\bigr) = 38\ln\frac{D+2}{D+1}
\le \frac{38}{D+1},
$$

using $\ln(1+x) \le x$ with $x = 1/(D+1)$. The marginal value of a dependent
falls like $1/D$, so no single signal can dominate the ranking.

### Rank thresholds as counts

The rank buckets are thresholds on $S$: `S` from $260$, `A` from $180$, `B`
from $110$, `C` from $50$. Inverting $\sigma$ shows what they mean in counts.
With $m = 1$ and a single non-zero signal of weight $w$, the score reaches a
threshold $T$ when

$$
w \ln(1 + n) \ge T
\iff n \ge e^{T/w} - 1,
$$

so the smallest integer count is $\lceil e^{T/w} - 1 \rceil$:

| Threshold | Dependents only ($w = 38$) | Recent dependents only ($w = 27$) | Downloads only ($w = 22$) |
| --- | --- | --- | --- |
| `C` ($T = 50$) | 3 | 6 | 9 |
| `B` ($T = 110$) | 18 | 58 | 148 |
| `A` ($T = 180$) | 114 | 785 | 3575 |
| `S` ($T = 260$) | 936 | 15208 | 135697 |

For example $38\ln 937 \approx 260.02$ while $38\ln 936 \approx 259.98$, so
936 dependents are the first count to reach `S` on their own. In practice the
signals combine: 20 dependents, 4 recent dependents and 300 downloads already
give $B \approx 284.7$.

### Growth and momentum

A snapshot evaluates the score twice, on the current signals and on the
signals of 30 days ago, and defines

$$
G = S - S_{30}, \qquad
r =
\begin{cases}
G / S_{30} & S_{30} > 0 \\
1 & S_{30} = 0,\ G > 0 \\
0 & S_{30} = 0,\ G \le 0.
\end{cases}
$$

Since $m(t) > 0$, $S_{30} = 0$ exactly when every historical count is $0$:
the package had no dependents and no downloads 30 days ago. For such a
package the relative growth $G / S_{30}$ is undefined, and the implementation
uses $1$ (that is, 100 %) instead of $+\infty$ so that $r$ stays finite and
can be stored and sorted.

The momentum label tests three conditions at two levels:

$$
\text{Rising} \iff G \ge 35 \land r \ge 0.35 \land R \ge 3, \qquad
\text{Hot} \iff \lnot\text{Rising} \land G \ge 18 \land r \ge 0.18 \land R \ge 2.
$$

The `Rising` conditions imply the `Hot` conditions, so the classes are nested
levels of one scale rather than independent tags. When $S_{30} > 0$,
$r \ge \rho$ is the same as $S \ge (1 + \rho) S_{30}$, so `Rising` asks for a
score at least $1.35$ times the old one *and* an absolute gain of $35$
points. The absolute bound stops tiny packages from rising by going from
$1$ to $2$ points; the relative bound stops large packages from rising
through the noise of a big base.

## Design decisions

### Logarithms of counts

**Problem.** Dependent and download counts are heavy-tailed: a few packages
have thousands, most have none. A linear score would make the ranking a
leaderboard of the largest package in each signal.

**Options.** Raw counts; ranks or percentiles within the registry; square
roots; logarithms.

**Choice.** $\ln(1 + n)$. The shift by one keeps $\sigma(0) = 0$ finite and
makes $S = 0$ exactly when a package has no signal at all. Percentiles would
need the whole registry and change a package's score when other packages
appear, which breaks the CLI's one-package-at-a-time contract. Square roots
still grow without the scale invariance derived above.

### Additive weights

**Problem.** The three signals must be combined into one number.

**Choice.** A weighted sum of logarithms with weights $38 : 27 : 22$.
Total dependents capture established adoption and weigh most. Downloads are
an external popularity hint that is missing for packages the builder could
not look up, so they weigh least. Recent dependents are counted *on top of* total dependents, so a
dependent from the recent window contributes to both terms: the recent term
is a bonus for current adoption, not a separate population. The weights are
editorial choices of this project, not fitted parameters.

### A recency multiplier, not a recency term

**Problem.** Old, unmaintained packages should not hold their rank forever,
but age must not outweigh adoption.

**Choice.** A multiplicative step function between $0.88$ and $1.12$. Because
it multiplies $B$, it changes the score by at most $\pm 12\,\%$, and the ratio
between the freshest and the oldest package with the same signals is
$1.12 / 0.88 \approx 1.27$. That can move a package across one rank boundary
(for example $B = 240$ gives `S` at $1.12$ and `A` at $0.88$) but never turns
an unused package into a ranked one: $B = 0$ stays $0$. An additive age term
would give unused but freshly released packages a positive score.

### Fixed thresholds for labels

**Problem.** The web pages need short, stable labels.

**Choice.** Constant thresholds on $S$ and $G$. Labels therefore mean the same
in every snapshot and need no registry-wide statistics. Quantile buckets
("top 5 %") would need the whole registry, like percentile scores.

### Integers in, `Double` out

**Problem.** The signals are counts, but the score is real-valued.

**Choice.** All inputs are `Int`, and negative values are clamped instead of
rejected, so every function is total and can be called on raw database
values. The scoring functions never abort and return no `Result`; the only
non-finite output is the overflow described under
[numerical accuracy](#numerical-accuracy).

## Correctness / invariants

### Monotonicity

For counts in $[0, 2^{31} - 2]$, $S$ is non-decreasing in $D$, $R$ and $W$,
and strictly increasing as long as the count stays below $2^{24}$:
$\sigma$ is strictly increasing, the weights are positive and $m(t) > 0$, so

$$
D < D' \implies 38\,\sigma(D) < 38\,\sigma(D') \implies S(D, R, W, t) < S(D', R, W, t).
$$

Above $2^{24}$ the conversion through `Float` (below) can map neighbouring
counts to the same value, so strict growth degrades to non-decreasing. $S$
is non-increasing in $t$ because $m$ is. The blackbox tests in
`impact_factor_test.mbt` check instances of this for dependents, downloads
and release age.

### Range

$S \ge 0$, with equality exactly when $D, R, W \le 0$. For counts up to
$2^{31} - 2$, $\sigma \le \ln 2^{31} \approx 21.49$, so

$$
S \le 1.12 \cdot (38 + 27 + 22) \cdot 31 \ln 2 \approx 2093.7 .
$$

### Labels are total

`rank_label` and `compute_momentum_label` return one of their labels for every
input. Every comparison with `NaN` is false, so a `NaN` score is ranked `D`
and has `Stable` momentum.

### Numerical accuracy

`log_signal` converts $n + 1$ to `Float` before taking the logarithm in
`Double`. Every integer up to $2^{24}$ is exact in `Float`; above it the
conversion rounds to nearest with relative error $|\delta| \le u = 2^{-24}$.
Then

$$
\begin{aligned}
\bigl|\ln\bigl((n+1)(1+\delta)\bigr) - \ln(n+1)\bigr|
  &= |\ln(1+\delta)| \\
  &\le \frac{|\delta|}{1 - |\delta|} \le \frac{u}{1-u} \approx 5.96 \times 10^{-8},
\end{aligned}
$$

and the error in $S$ from this conversion is at most
$1.12 \cdot 87 \cdot u/(1-u) \approx 5.8 \times 10^{-6}$, on top of the
ordinary `Double` rounding of a few operations. The index builder still
contains an unused Python copy of the formula (`compute_score` in
`scripts/build_index.py`) that calls `math.log1p` without the `Float` step;
it agrees with the MoonBit result to this bound plus a few units in the last
place. The database itself is filled through the MoonBit CLI.

The addition $n + 1$ is done in `Int`. For $n = 2^{31} - 1$ it wraps to
$-2^{31}$, the logarithm of a negative number is `NaN`, and the score is
`NaN`.

### Snapshot consistency

`compute_score_snapshot` computes every field from the same two calls of
`compute_score`, so `score_growth_30d == score - score_30d_ago` holds exactly
(it is the same floating-point subtraction), and `rank_label` and
`momentum_label` are always the labels of the stored numbers.

### How scores are ranked

The package only computes scores; consumers sort them. Every ordering in the
repository breaks ties deterministically: the ranked feeds and the default
search order use `score` descending, then `full_name` ascending, and the
`Hot` and `Rising` feeds use `score_growth_30d` descending, then `score`,
then `full_name`. The [static_search design](static_search.md) gives the
orderings of the browser search.

## Alternatives rejected

- **PageRank-style centrality** on the dependency graph would reward being
  depended on by important packages, but it needs the whole graph, an
  iterative solver and a damping parameter, and it cannot be explained on a
  package page. The direct dependent count is the first step of that
  iteration and is enough for a registry of this size.
- **Transitive dependents** were not used: they count the same downstream
  package many times through every path and favour low-level packages even
  more than the logarithm can correct.
- **Learning the weights** from a labelled ranking would need labels that do
  not exist; the fixed weights are stated in the code and in this page.
- **Returning `Result` for negative inputs** would push error handling into
  every caller for a condition that has an obvious meaning (no signal).

## Boundaries

- The score measures adoption inside one registry snapshot. It does not
  measure code quality, correctness, security or maintenance effort.
- The package takes the signals as given. Collecting them, deciding which
  dependents are recent and which downloads are trusted is the index
  builder's job, described in the [architecture guide](../architecture.md).
- The builder currently passes `0` as the historical download count, so
  `score_growth_30d` contains the whole download term
  $22\,m(t)\,\sigma(W)$ of the current score. Read growth together with the
  dependent counts, which the momentum label does by requiring recent
  dependents.
- There is no normalisation across packages, no time decay inside a window
  and no confidence interval: a score is a deterministic function of four
  integers.
- Counts of `2147483647` are not supported (the score becomes `NaN`).
