# Mooncake Impact Factor

This manual describes the current **`0.1.2`** baseline.

## Where to start

- [Getting started](getting_started.md) builds the local index, runs the web
  app, and queries its HTTP APIs.
- The `score` package has an [API reference](api/score.md), a
  [design note](design/score.md), and a [tutorial](tutorial/score.md).
- [Repository conventions](conventions.md) lists the consistency rules for this
  repository's documentation.

## Coverage

These docs describe the implementation currently present in this repository:

- MoonBit score computation in `src/score`
- SQLite index building in `scripts/build_index.py`
- Next.js route-handler APIs in `app/api`
- Browser UI and shared frontend logic in `app` and `frontend/src`
- Graphical advanced query building and native-expression search support

## Notes

- The ranking is derived from a local registry snapshot, not a globally authoritative ecosystem index.
- Download counts may come from live mooncakes responses, the local download cache, or a local override JSON file.
