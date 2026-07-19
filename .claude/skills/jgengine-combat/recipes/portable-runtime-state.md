# Save and restore closure-backed combat runtimes

Use this recipe when an existing project wants JGengine's convenient magazine
or stat-modifier runtime but keeps its own save system, clock, entities, and
authority. Both runtimes expose detached plain snapshots; no JGengine store or
`GameContext` is required.

## Install and focused imports

```sh
bun add @jgengine/core
```

```ts
import {
  createMagazine,
  type MagazineSnapshot,
} from "@jgengine/core/combat/magazine";
import {
  createStats,
  type StatsSnapshot,
} from "@jgengine/core/stats/statModifiers";
```

## Caller-owned save data

```ts
type VehicleStat = "speed" | "handling";

interface VehicleRuntimeSave {
  magazine: MagazineSnapshot;
  stats: StatsSnapshot<VehicleStat>;
}

interface ExistingSave {
  nowMs: number;
  vehicle: VehicleRuntimeSave;
  sharedAmmo: number;
}
```

The project owns this schema and decides when it is written, replicated,
rolled back, replayed, or transferred to a worker.

## Run and snapshot

```ts
let nowMs = 4_000;
let sharedAmmo = 18;

const magazine = createMagazine({
  capacity: 6,
  reloadMs: 900,
  reserve: {
    current: () => sharedAmmo,
    spend(amount) {
      if (amount > sharedAmmo) return false;
      sharedAmmo -= amount;
      return true;
    },
    gain(amount) {
      sharedAmmo += amount;
    },
  },
});

const stats = createStats<VehicleStat>(
  { speed: 12, handling: 8 },
  { now: () => nowMs },
);
stats.addSource("boost", { speed: { multiply: 1.25 } }, { expiresAtMs: 7_000 });

magazine.fire(2);
magazine.startReload();
magazine.tick(0.3);

const save: ExistingSave = {
  nowMs,
  vehicle: {
    magazine: magazine.snapshot(),
    stats: stats.snapshot(),
  },
  sharedAmmo,
};

const serialized = JSON.stringify(save);
```

Snapshots are detached from the live closures. Mutating or continuing the
runtime after this point does not rewrite `save`.

## Restore and resume

```ts
const decoded = JSON.parse(serialized) as ExistingSave;
nowMs = decoded.nowMs;
sharedAmmo = decoded.sharedAmmo; // restore caller-owned reserve first

const resumedMagazine = createMagazine({
  capacity: 6,
  reloadMs: 900,
  loaded: 0,
  reserve: {
    current: () => sharedAmmo,
    spend(amount) {
      if (amount > sharedAmmo) return false;
      sharedAmmo -= amount;
      return true;
    },
    gain(amount) {
      sharedAmmo += amount;
    },
  },
});
if (!resumedMagazine.restore(decoded.vehicle.magazine)) {
  throw new Error("magazine save does not match its reserve configuration");
}

const resumedStats = createStats<VehicleStat>(
  { speed: 0, handling: 0 },
  { now: () => nowMs },
);
resumedStats.restore(decoded.vehicle.stats);

resumedMagazine.tick(0.6); // finishes the same in-progress 900ms reload
nowMs = 7_000;
resumedStats.get("speed"); // injected clock expires the boost deterministically
```

For a self-managed numeric magazine reserve, the magazine snapshot contains
and restores that reserve directly. For a caller-owned `MagazineReserve`, save
and restore the caller's reserve first; `restore` returns `false` rather than
partially changing loaded/reload state when it cannot reconcile the reserve.

## Ownership

The existing project owns save versioning, entity identity, clock value,
reserve state, networking/rollback policy, content, and when ticks occur.
JGengine owns the closure convenience methods, snapshot encoding shape,
detached copies, and deterministic continuation once the caller supplies the
same config and clock.

## Common traps

- Re-supply immutable configuration such as magazine capacity/reload duration
  and the stat id set when rebuilding a runtime; snapshots contain mutable
  state, not content catalogs.
- Restore externally-owned reserve data before calling `Magazine.restore`.
- Persist the injected clock alongside expiring modifier snapshots or convert
  expiry timestamps in the project's migration layer.
- Do not keep a live snapshot object as mutable state. Restore it into a runtime
  and take a fresh snapshot for the next save.
- Check the boolean returned by `Magazine.restore`; reserve-kind mismatches and
  unreconcilable external reserves are rejected without partial magazine state.
