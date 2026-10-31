/**
 * The parts most game features are made of, one line each, model layer only. Import a part from here
 * or from its home; a feature never writes its own copy.
 */

/** Meter: a number with a range that drains, fills or regenerates: health, hunger, ammo, torpor. */
export * from "./stats/statPool";
/** Ladder: ordered steps over a number, named by the game: rarity, tiers, ranks, mood bands. */
export * from "./threshold/thresholds";
/** Phases: named states one after another, by time or by event: growth stages, boss phases, day parts. */
export * from "./time/stateSchedule";
/** Schedule: something happens at a pace from a start time: waves, supply drops, weather, events. */
export * from "./time/pacedSchedule";
/** Slots: named spots that each hold one thing, ready again a while after: supply drop crates, resource nodes, boss spawns. */
export * from "./time/refillSlots";
/** Placement: where something appears: spawn points, scatter, drop zones, safe spots. */
export * from "./world/spatialSample";
export * from "./game/spawnPoints";
/** Table: a weighted choice the game fills: supply drop loot per rarity, which enemy, which mutation. */
export * from "./random/pick";
/** Requirement: a condition over facts the game names: level gates, keys, quest prerequisites. */
export * from "./rules/predicate";
/** Modifiers: stacked add, multiply, override and clamp on a value: buffs, gear stats, difficulty. */
export * from "./progression/statGraph";
/** Inheritance: a child's values from its parents with variation: breeding, crossing plants. */
export * from "./inheritance/inheritance";
/** Motion track: a thing follows a path over time and arrives: a supply drop falling, a thrown item, a door. */
export * from "./movement/motionTrack";
