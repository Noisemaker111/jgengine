Grass boards shoot in bounded runs that carry on where the last stopped, instead of one run the 90-minute guard kills

### Fixed

- `bun run shoot --board` no longer runs for hours under one 90-minute guard that killed full boards part way (292 captures at 40 s to 2 min each). One run shoots for `--budget` seconds (default 6 min), records each shot in the board folder's `board.json` as it lands and exits 3 while shots remain; the same command carries on, and the run that takes the last shot lays out the sheets. A killed run loses only the capture in flight, a failed capture is named and keeps the board unfinished (no sheets with gaps) until it lands, and shots taken with other code are retaken (`--resume` keeps them)
- A board run killed by its guard names the shot that hung instead of "hung before it reported a step"
