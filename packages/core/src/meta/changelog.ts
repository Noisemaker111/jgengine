export const VERSION = "0.5.0";

export interface ChangelogEntry {
  migrate: readonly string[];
  added: readonly string[];
  changed: readonly string[];
  removed: readonly string[];
}

export const CHANGELOG: Record<string, ChangelogEntry> = {
  "0.5.0": {
    migrate: [
      "Bump every @jgengine/* dependency to ^0.5.0 (the eight packages version in lockstep).",
      "0.5.0 is additive — all 0.4.0 APIs are unchanged, so no code change is required to upgrade.",
      "Optional: replace a game's hand-rolled progression/curves.ts with leveling({ xpForLevel: { kind: 'power', base, exponent, round: 'floor' }, maxLevel }) from @jgengine/core/game/progression; its xpForLevel/resolve/grantXp are drop-ins and ctx.scene.entity.stats satisfies LevelingStatAccess with no adapter.",
    ],
    added: [
      "@jgengine/core/game/progression — declarative scalar curves (curve/evalCurve: const, linear, power, geometric, steps, piecewise with round + min/max) and a leveling() XP->level track built on an xpForLevel curve.",
      "@jgengine/core/inventory/slotModel — pure slot-grid primitives (createSlots, placeAt, removeAt, moveSlot).",
      "@jgengine/core/world/geometry, /world/interiors, /world/placement — pure world primitives: grid snapping, footprint AABBs/overlap, interior/exterior spaces, and placement validation.",
      "@jgengine/react/engineStore — raw-store React bindings (useEngineState, useEngineStore, useEngineEvent).",
      "Pure/functional tiers for the trade, unlocks, quest, and feed verbs in @jgengine/core/game.",
    ],
    changed: [],
    removed: [],
  },
  "0.4.0": {
    migrate: [],
    added: ["Baseline release: core, ws, sql, react, convex, node, shell, assets."],
    changed: [],
    removed: [],
  },
};
