### Added

- `terrain({ cellSize })` states ground density as world units per quad instead of a segment count, and derives the per-axis grid from `bounds` — the same `cellSize` on a bigger world spends more cells rather than stretching one count across it. `segments` still works and also takes `[x, z]` for a non-square grid. Setting both fails naming `cellSize`; a cell size over the 1,000,000-vertex ceiling fails with the cell/vertex numbers and the smallest `cellSize` that fits.

### Fixed

- `shoot --url ... --look` now sends the aim to the page it captures, so a lane can measure a branch on a dev runner it started itself. The read-back stays: a page that reports no applied aim still fails the capture instead of returning a plausible wrong view, and a page that applies `--param look=` itself can report it on `data-jg-look` or `window.__jgLook`. `--site --look` is refused at the command line, naming the `--url` form that works.
