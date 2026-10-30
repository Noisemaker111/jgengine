policeResponse and heatSystem; a general alert level (witness-gated value, game-supplied ladder, stand-down) is built on the meter, ladder and schedule parts, and Harbor Heat owns its stars, officers and numbers

Refs #2817

Engine seam: packages/core/src/ai/alertLevel.ts, packages/core/src/ai/heatSystem.ts, packages/core/src/ai/policeResponse.ts, packages/core/src/stats/statPool.ts, packages/core/src/world.ts

### Migrate

- @jgengine/core/ai/policeResponse and ai/heatSystem are gone; use ai/alertLevel createAlertLevel with your own tier ladder and tuning, and compose dispatch with time/pacedSchedule

### Added

- `createAlertLevel` (`@jgengine/core/ai/alertLevel`): An alert level any stealth, heist or pursuit game can use, over the meter and ladder parts: reports raise a bounded value only while an observer holds the target in view, the value bleeds on the caller's curve once the target has been out of every observer's sight, labelled cut points decide what the alert resolves to, and a stand-down countdown tells the caller when to call its units off. Also `AlertAnchor`, `AlertLevel`, `AlertLevelConfig`, `AlertLevelState`, `AlertSighting`, `AlertStats`, `AlertStep`, `AlertTickContext` and 2 more.
- `createAlertLevel` (`@jgengine/core/world`): An alert level any stealth, heist or pursuit game can use, over the meter and ladder parts: reports raise a bounded value only while an observer holds the target in view, the value bleeds on the caller's curve once the target has been out of every observer's sight, labelled cut points decide what the alert resolves to, and a stand-down countdown tells the caller when to call its units off. Also `AlertAnchor`, `AlertLevel`, `AlertLevelConfig`, `AlertLevelState`, `AlertSighting`, `AlertStats`, `AlertStep`, `AlertTickContext` and 2 more.

### Removed

- policeResponse and heatSystem; a general alert level (witness-gated value, game-supplied ladder, stand-down) is built on the meter, ladder and schedule parts, and Harbor Heat owns its stars, officers and numbers
- police roadblocks and the lane-graph cordon, which no game used
- `@jgengine/core/ai/heatSystem` no longer exports `HeatConfig`, `HeatGain`, `HeatLevelDef`, `HeatPoint`, `HeatState`, `HeatStep`, `HeatTickContext`.
- `@jgengine/core/ai/policeResponse` no longer exports `DEFAULT_POLICE_TIERS`, `DEFAULT_POLICE_TUNING`, `PoliceLaneHit`, `PoliceResponse`, `PoliceResponseConfig`, `PoliceResponseKind`, `PoliceResponseState`, `PoliceRoadblockSite` and 12 more.
- `@jgengine/core/world` no longer exports `DEFAULT_POLICE_TIERS`, `DEFAULT_POLICE_TUNING`, `HeatConfig`, `HeatGain`, `HeatLevelDef`, `HeatPoint`, `HeatState`, `PoliceLaneHit` and 17 more.
