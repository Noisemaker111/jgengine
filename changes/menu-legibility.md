### Fixed

- `GameMenu` keeps its text readable on a bright scene. The detail pane now carries its own scrim (`--jg-menu-pane-surface`, default a dark gradient, set it to `none` for no surface), the surface tint is stronger on the right, and the dim-text default rose from 0.66–0.68 alpha to 0.84–0.88.
- The selected verb is a filled rail with a 3px accent bar and a ring instead of a thin border, so the current row reads at a glance on any background. `--jg-accent-glow` still colours the fill.
