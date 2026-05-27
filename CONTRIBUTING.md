# Contribution Guidelines

This guide describes the current repository workflow for the **`0.1.0`**
baseline on this branch.

## Scope

The repository currently contains:

- a MoonBit scoring package in `src/score`
- Python indexing and serving utilities in `scripts`
- a static local UI in `web`
- release-aligned documentation in `doc`

Keep changes scoped to one of those responsibilities and avoid mixing unrelated
work in the same commit.

## Code Style

- Run `moon fmt` for MoonBit code.
- Keep Python code straightforward and structured around small functions.
- Prefer descriptive names tied to package metadata, dependency edges, score
  semantics, or HTTP behavior.
- Keep comments short and use them only when scoring or indexing behavior is
  not obvious from the code.

## Naming

- Use `lowercase_with_underscores` for Python bindings and MoonBit value names.
- Use `PascalCase` for MoonBit public types.
- Use `UPPERCASE_WITH_UNDERSCORES` for Python module constants.
- Avoid generic file names such as `utils.py`, `helpers.py`, or `misc.mbt`.

## Documentation Expectations

- `README.md` and `doc/*` must describe the implementation that actually exists
  on the branch.
- Document stable CLI flags, HTTP endpoints, score thresholds, and release
  behavior when they change.
- If a behavior depends on local registry snapshots or mooncakes download data,
  say so explicitly instead of implying global authority.
- When changing the score formula in Python, keep the MoonBit implementation
  aligned in the same change.

## Validation

Run the baseline checks before committing:

```bash
moon fmt
moon check --target all
moon test --target all
```

Useful repository commands:

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just serve
just dev
./run_test.sh
```

If you change indexing, serving, or release behavior, validate the affected
command paths as well.

## Commit Policy

- Use English Conventional Commits such as `docs:`, `feat:`, `fix:`, `test:`,
  `refactor:`, or `chore:`.
- Keep each commit focused on one logical change.
- Do not mention file paths in the commit summary.
- Re-check the final commit message immediately before `git commit`.

## Release Checklist

- Bump the version in `moon.mod` before publishing.
- Keep `README.md`, `CONTRIBUTING.md`, and `doc/*` aligned with the branch.
- Ensure `.github/workflows/publish.yml` still matches the MoonBit manifest
  layout.
- Run `moon check --target all` and `moon test --target all`.
- Trigger `publish-package` manually after validation.
- If mooncakes reports a duplicate version, publish a new bumped version
  instead.
