# Add XP and leveling to an existing store

Use this recipe when an existing JavaScript/TypeScript project owns its player
state and save format but wants JGengine's deterministic XP curves,
multi-level grants, and per-level events. No `GameContext`, renderer, React,
entity store, or JGengine loop is required.

## Install and focused imports

```sh
bun add @jgengine/core
```

```ts
import {
  leveling,
  type LevelingStatAccess,
} from "@jgengine/core/game/progression";
```

## Caller-owned save data

```ts
interface SavedPool {
  current: number;
  max: number;
}

interface PlayerSave {
  experience: SavedPool;
  rank: SavedPool;
  unlockedAbilities: string[];
}

interface ExistingSave {
  players: Record<string, PlayerSave>;
}

let save: ExistingSave = {
  players: {
    player_1: {
      experience: { current: 0, max: 100 },
      rank: { current: 1, max: 20 },
      unlockedAbilities: [],
    },
  },
};
```

## Minimal adapter

```ts
const stats: LevelingStatAccess = {
  get(userId, statId) {
    const player = save.players[userId];
    if (player === undefined) return null;
    if (statId === "experience") return player.experience;
    if (statId === "rank") return player.rank;
    return null;
  },
  set(userId, statId, patch) {
    const player = save.players[userId];
    if (player === undefined) return false;
    const previous = statId === "experience"
      ? player.experience
      : statId === "rank"
        ? player.rank
        : null;
    if (previous === null) return false;
    const next = {
      current: patch.current ?? previous.current,
      max: patch.max ?? previous.max,
    };
    const nextPlayer = statId === "experience"
      ? { ...player, experience: next }
      : { ...player, rank: next };
    save = {
      ...save,
      players: {
        ...save.players,
        [userId]: nextPlayer,
      },
    };
    return true;
  },
};
```

The adapter may call a Zustand `set`, dispatch a Redux action, write an ECS
component, or replace plain data as above. It never mirrors the player into a
JGengine store.

## Configure and grant XP

```ts
const emitted: unknown[] = [];
const existingEvents = {
  emit(name: string, payload: unknown) {
    emitted.push({ name, payload });
  },
};

const playerLevel = leveling({
  xpForLevel: {
    kind: "power",
    base: 80,
    exponent: 1.35,
    round: "floor",
  },
  maxLevel: 20,
  xpStat: "experience",
  levelStat: "rank",
});

const levelEvents: number[] = [];
const levelsGained = playerLevel.grantXp(
  stats,
  "player_1",
  900,
  (level) => {
    levelEvents.push(level);
    existingEvents.emit("player-level-up", { playerId: "player_1", level });
  },
);
```

`levelsGained` is the count returned to the caller. The callback fires once for
every reached level in ascending order, so a large reward can unlock each
milestone deterministically instead of collapsing them into one final event.

Use `playerLevel.resolve(level, xp)` when prediction/UI needs the same math
without writing through the adapter.

## Save and restore

The adapter's authoritative values already live in the existing save:

```ts
const encoded = JSON.stringify(save);
save = JSON.parse(encoded) as ExistingSave;

// Recreate an adapter over the restored store, then continue normally.
playerLevel.grantXp(stats, "player_1", 75, (level) => {
  existingEvents.emit("player-level-up", { playerId: "player_1", level });
});
```

The leveling track is immutable configuration; recreate it from the same curve
after load. Version curve changes in the existing project's migration layer.

## Ownership

The existing project retains player identity, store updates, save schema,
curve/content choice, reward sources, event bus, unlock handling, UI, backend,
and when XP is granted. JGengine owns curve evaluation, surplus rollover,
level caps, ordered level events, and the two-method stat adapter contract.

## Common traps

- Initialize both configured stat ids; `grantXp` returns `0` when either is
  missing.
- Treat positive and negative XP policy as game-owned input validation;
  sanitize rewards before calling when XP loss is not allowed.
- The default threshold mode is `perLevel`. Use `cumulative` only when the curve
  represents total lifetime XP required to reach each level.
- Keep `rank.max` aligned with `maxLevel` in the caller's schema.
- Apply milestone rewards from each callback invocation; do not assume a large
  grant emits only the final reached level.
