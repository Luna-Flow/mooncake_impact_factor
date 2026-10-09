# query design

This page explains the search query language of
[`src/query`](../../../src/query/parser.mbt): its grammar and precedence,
the tree it produces, why the serializer and the parser agree, how the flat
parameters of the web interface map to the same tree, and what the
operations cost. The [query API](../api/query.md) lists the functions.

## Design goal

One query must mean the same thing wherever it runs: typed as an expression,
built in the graphical query builder, carried in a URL, answered by SQLite
or by the static site's worker. So the language needs a single owner that
parses, validates and normalises it, and that owner must give the same
result on every backend. Before this package the language lived in
TypeScript (`lib/query.ts`); it is now MoonBit, and the TypeScript module is
a thin wrapper.

## Mathematical background

### Grammar

The expression language, after removing white space between tokens, is

```ebnf
query    = [ or ] ;
or       = and , { "OR" , and } ;
and      = unary , { "AND" , unary } ;
unary    = "NOT" , unary | primary ;
primary  = "(" , or , ")" | term ;
term     = word , op , value | word | quoted ;
op       = ":" | "=" | ">=" | "<=" ;
value    = word | quoted ;
quoted   = '"' , { char - ( '"' | "\" ) | "\" , char } , '"' ;
word     = char - delim , { char - delim } ;   (* not AND, OR, NOT *)
delim    = space | "(" | ")" | ":" | "=" | ">=" | "<=" ;
```

`AND`, `OR` and `NOT` are recognised in any letter case; field names are
case-sensitive. `space` is the ECMAScript white space set
(`is_white_space`), so a full-width space separates words like an ASCII one.
A word stops only at a delimiter, so `a>b` is one word and
`repository:https://x` is the term `repository:https` followed by the stray
tokens `: //x`, which the parser rejects.

The tokenizer works on UTF-16 code units, like the TypeScript code it
replaces. All delimiters are ASCII, so a surrogate pair is never split.

### Precedence and the shape of the tree

The grammar is the usual precedence-climbing one:
$\lnot$ binds tighter than $\land$, which binds tighter than $\lor$. So

$$
\texttt{NOT a OR b AND c} \;=\; (\lnot a) \lor (b \land c).
$$

Each `or` and `and` rule collects its operands into one group; a rule with
a single operand returns the operand itself (`coalesce`). Hence

- `a AND b AND c` is one `And` group with three children, not a binary
  tree, because the loop collects all operands;
- `(a)` is the term `a`, not a group of one;
- `(a AND b) AND c` keeps the inner group: parentheses are respected even
  when they change nothing.

`NOT` flips the `negated` flag of its operand instead of adding a node, so
`NOT NOT a` is the term `a` with `negated = false`. The root is always a
group: a lone term is wrapped in an `And` group, so every consumer can start
from `Group`.

### Serialization and round trips

`serialize` writes a tree back. Let $P$ be `parse_expression` and $S$ be
`serialize`. The property that matters is semantic: for every tree $t$ the
parser can produce, $P(S(t))$ has the same truth value as $t$ on every
package. It follows from three rules.

1. **Values.** A value is written bare only when it is made of
   `[A-Za-z0-9_./-]` and is not a keyword; otherwise it is quoted with `\`
   and `"` escaped. A bare value therefore re-tokenizes to exactly one word,
   and a quoted one to exactly its text. Values are trimmed, which matches
   the evaluators: every text test trims its needle first.
2. **Precedence.** A group with two or more children is parenthesised when
   its connective differs from its parent's. A same-connective child needs
   no parentheses because $\land$ and $\lor$ are associative:
   $(a \land b) \land c = a \land b \land c$.
3. **Negation.** `NOT` binds tighter than both connectives, so a negated
   group with two or more children is always parenthesised:
   $\lnot(a \land b)$ must not become $\lnot a \land b$.

$S$ is not injective, so $P(S(t)) = t$ does not hold in general: `(a AND b)
AND c` comes back flattened. It holds after one round, $S(P(S(t))) =
S(t)$, which the tests check for a set of expressions.

The language has no spelling for an empty group. The query builder can
create one, and $S$ writes it as `()`, which does not parse. A tree with an
empty group is still valid JSON and evaluates normally (empty `And` = true,
empty `Or` = false).

### Flat parameters

The web interface also keeps one parameter per field. `legacy_params_to_ast`
maps them to

$$
t_{\text{flat}} = \bigwedge_{p \,:\, v_p \neq ""} \tau_p(v_p),
$$

where $\tau_p$ is the term of parameter $p$ (for example `minScore` ↦
`score>=`). `rank` and `momentum` accept lists: with labels
$\ell_1, \dots, \ell_k$ after canonicalisation,

$$
\tau_{\text{rank}}(\ell_1, \dots, \ell_k) = \bigvee_{i=1}^{k} (\texttt{rank} = \ell_i),
$$

which is a single term for $k = 1$ and nothing for $k = 0$. `derive_ast`
chooses, in order, a non-blank `ast` parameter, a non-blank `expr`, and
$t_{\text{flat}}$.

### Numbers and white space

Numeric terms keep their value as text; consumers read it with
`number_value`, which implements ECMAScript `StringToNumber`: trimmed blank
text is $0$, `0x`/`0o`/`0b` literals are integers in that base, `Infinity`
is infinite and everything else must be a decimal literal or gives NaN. The
decimal case is parsed by `@string.parse_double`, which rounds correctly,
after the syntax has been checked in MoonBit (the core parser also accepts
`1_000` and `inf`, which ECMAScript does not).

## Design decisions

### MoonBit owns the language

**Problem.** The parser, the serializer and the validator were TypeScript,
and the static evaluator and the SQL compiler were separate TypeScript files
that had to agree with them.

**Choice.** All of them are MoonBit packages now (`query`, `query_sql`,
`static_search`), and the TypeScript side calls the generated JavaScript
through JSON strings. The JSON shape of the tree did not change, so URLs
and stored queries keep working.

### Strings at the JavaScript boundary

**Problem.** The web code needs the functions with TypeScript types.

**Choice.** Each exported function takes and returns strings, and failures
come back as `{"error": …}` envelopes instead of exceptions. Strings are
the one type both sides represent the same way, the JSON form already
existed, and an envelope keeps the error message intact across the
boundary. `lib/query.ts` turns the envelopes back into objects and thrown
`Error`s, so its callers did not change.

### One list per label set

The rank and momentum labels are each defined once (`rank_labels`,
`momentum_labels`). Error messages, list parsing, the SQL compiler and the
static evaluator all derive from them, so adding a momentum label is a
one-line change.

### Fixed tables instead of host functions

`trim`, `number_value` and the case-insensitive keyword test are written in
MoonBit rather than delegated to the host, because Luna-Flow packages must
give identical results on every backend. They reproduce the ECMAScript
behaviour that the previous TypeScript code had, so no query changes meaning.

## Correctness / invariants

- Every tree the parser returns has a group at the root and validates:
  `decode(encode(t)) == t`.
- `S(P(S(t))) = S(t)` for parser output, and $P(S(t))$ evaluates like $t$.
- `has_intent` is false exactly when every term value is blank; the search
  then lists everything instead of filtering.
- `negated` is written to JSON only when true, so the encoding of a tree is
  unique.

## Complexity

For an expression of $n$ code units, tokenizing is $O(n)$ (escapes are
copied in slices), parsing is $O(\text{tokens})$ with recursion depth equal
to the parenthesis depth, and serialization is $O(n)$ in the size of the
output. Validation of a JSON tree with $m$ nodes is $O(m)$.

## Alternatives rejected

- **Keep the TypeScript parser** and port only the evaluator. Two languages
  would again own one grammar.
- **Pass MoonBit objects to JavaScript** instead of JSON. The generated
  objects are not plain JSON, so every consumer would need adapters.
- **A parser generator.** The grammar has five rules; a hand-written
  recursive-descent parser keeps the error messages the interface already
  shows.

## Boundaries

- The language has no empty group, no wildcard syntax and no ranges in one
  term (`score>=1 AND score<=2` is the way to write a range).
- `query` does not know the database or the index; it does not decide what
  a field matches. That is `query_sql` and `static_search`.
- Values are not validated per field here: `score>=abc` parses, and the SQL
  compiler rejects it while the static evaluator matches nothing.
