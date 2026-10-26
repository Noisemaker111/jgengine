### Fixed

- A `HudPanel` that has not been moved takes its `anchor` on every render. It used to keep the anchor it first mounted with, so a game that picks its anchor per display profile stayed where it started after a resize.
- A layout region is re-measured when the game viewport's DOM changes. A panel that opens beside another one no longer leaves the neighbour's old rectangle in the overlap report.
