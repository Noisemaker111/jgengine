### Added

- World model triggers (`triggers`): a rule fires the moment its conditions become true, applying `then`, firing a ripple, logging a note and running a hook; it re-arms when the conditions lapse, or never with `once`. Turf changing hands or a district rioting is now one declaration.
- Ripple variants: a ripple can be a list, each variant gated by `when`, `whenPlace` (facts of the place it lands on, such as its owner) or `whenTarget`, so one event lands differently by who holds the block.
- Targeted schedules and ripple targets: a schedule with `on` picks one built instance of a kind or tag (filtered by `whenTarget`, rolled from the world clock so a reload rolls the same), with an optional `chance`; the ripple's `target` changes land on it and `{target}` names it in the note. Slots take a `label` for that name. Action ripples carry their target too.
- Live facts (`createWorldModel(..., { live })`, `defineGameSpec({ live })`): facts the game computes, such as the hour or the wanted level, that conditions, lines, flows and triggers read and saves never hold.
- `WorldModel.advance(seconds, { maxFires })` catches up time spent away in one step: flows pay, facts calm, queues finish, triggers fire and each schedule fires a bounded number of times, with the gains and log lines returned for a "while you were away" summary.
- Police response cover and pay-offs: `PoliceTickContext.hidden` stops sightings and runs the cold trail `hiddenRate` (default 3) times faster for a garage or hideout, and `PoliceResponse.forgive(amount)` takes heat off at once for a bribe or a fine.
