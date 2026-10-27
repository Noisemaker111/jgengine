A game no longer writes which engine capabilities it adopts or why it skips the rest. The capability gate reads adoption from each game's imports, so the 690 hand-kept `adopts` ids and 783 "not-applicable" decline sentences are gone from the games' `jgengine.json` files. What a game still writes is what source cannot show: adoption debt (a reason naming the domain and the open issue that tracks it) and boot probes. Debt reasons are checked against the capability's feature folder, so the hand list of capability domains is gone too. New engine capabilities no longer ask every game for a decision.

### Changed

- In-repo game `jgengine.json` `capabilities` holds only `debt` (`{ reason, issue }` per capability id) and `probes`; adoption is read from the game's imports.
- `jgengine sync` no longer writes capability answers.

### Removed

- The not-applicable decline and the per-game `adopts` list; `CapabilityDecline` is replaced by `CapabilityDebt`.
