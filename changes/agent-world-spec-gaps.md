### Added

- World model kinds take `tags`: an action's `on`, a total's `of` and `instances(tag)` cover every kind carrying the tag (one Upgrade for every tower).
- Selling refunds a share of everything an instance cost, build plus upgrades (`WorldInstance.paid`); tick `removed` now lists `{ id, kind, label, refund }`.
- `place(kind, at, { free, built })` seeds a layout without paying or waiting.
- Kinds and actions take `refuse`, the game's own words when `when`/`whenTarget` doesn't hold.
- A timed action already queued on a target refuses `busy` instead of queueing twice.
- Hook calls carry `target`: the instance an action landed on or that just became ready.
- `defineGameSpec` adds `onRestored` (every built instance on the first frame and after a save loads) and `accepting` (refuse all commands with a message, e.g. "The park is closed"); `<id>.remove` refuses when there is nothing to remove.

### Changed

- `GameSpecDecl.onRemoved` receives the removed view instead of an id.
