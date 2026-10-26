Ember Command's war-table HUD places itself, so its sheets stay clear of each other at every screen size.

### Changed

- Ember Command draws the ledger, orders note, pause seal, survey map, Bram's card, command board, order hints and level-up writ as `HudCanvas` panels with one anchor and a priority each, instead of hand-placed CSS. The map folds into a toggle when there is no room for it rather than being hidden below 1180px, and the hand-registered layout regions are gone because every panel registers its own.
