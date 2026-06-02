# Mooncake Impact Factor Docs

English documentation entry point for the current **`0.1.2`** baseline.

## Documentation Map

- [Documentation standard](./doc_standard.md)
- [Tutorial](./tutorial.md)
- [Score API](./score/api.md)
- [Score design](./score/design.md)

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
