# static_search Design

This subsystem is the MoonBit-side support for the search and analysis pipeline that feeds the web application.

## Responsibilities

- Keep the code and docs aligned around `src/static_search`.
- Preserve the real execution model instead of smoothing over important internal differences.
- Note extension points, invariants, and limitations that maintainers must keep stable.

## Maintenance Notes

- Update this page whenever the module boundary, core algorithm, or observable semantics change.
- If the module is intentionally incomplete, say so here instead of documenting speculative APIs.
