### Fixed

- Explicit `onDeath` drop rules with `when.reason: "any"` can spawn world items after non-player deaths. Ordinary tables remain suppressed without a player killer, and bag and currency grants still require one. Hosted players and uniquely owned pawns retain their own loot recipient rather than the host's inventory.
