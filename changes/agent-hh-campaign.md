### Added

- `@jgengine/core/worldModel/worldModel`: `defineWorldModel` / `createWorldModel` declare one world of factions, places, people, things, jobs, ripples and schedules as flat facts. Missions, dialogue lines, phone contacts, map blips, the next-step tracker and a news log all read from it, and its state lives in one store, so saves and co-op sync come with it. `spend` applies costs all-or-nothing, and `hook` names game code for whatever a declaration can't say (#2412, #2413).
- Mission `survive` objectives accept `until`: a world-fact condition to hold for, with or without a `duration`.
