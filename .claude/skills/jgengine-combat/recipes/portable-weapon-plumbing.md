# Fire a weapon with your own Three.js raycaster

Use this recipe when an existing Three.js/JavaScript game wants JGengine's fire
cadence, magazine/reload, and deterministic damage resolution but keeps its own
models, animations, muzzle flash, audio, input, camera, aiming, and — crucially —
its own raycaster and entity list. There is no default gun: you compose generic
primitives. No `GameContext`, entity store, renderer, or React is required.

## Install and focused imports

```sh
bun add @jgengine/core three
```

```ts
import {
  createWeaponRuntime,
  type WeaponRuntime,
} from "@jgengine/core/combat";
import type { DamageHitInput } from "@jgengine/core/combat";
import * as THREE from "three";
```

## Caller-owned aim, entities, and raycaster

The engine never touches your scene. You own the raycast; it returns whatever hit
shape you like.

```ts
interface Enemy {
  id: string;
  mesh: THREE.Object3D;
  armored: boolean;
}

const enemies: Enemy[] = loadEnemies();
const raycaster = new THREE.Raycaster();

function raycastFromCamera(camera: THREE.Camera): Enemy[] {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); // center-screen shot
  const meshes = enemies.map((e) => e.mesh);
  const intersects = raycaster.intersectObjects(meshes, true);
  const first = intersects[0];
  if (first === undefined) return [];
  const enemy = enemies.find((e) => e.mesh === first.object || e.mesh === first.object.parent);
  return enemy === undefined ? [] : [enemy];
}
```

## Compose the weapon runtime

`cadenceMs`, `magazine`, and `ready` are plain data; `resolveHits` runs your
raycaster and `damageFor` maps a hit to a portable damage input (return `null` to
skip damage, e.g. a wall). Derive `cadenceMs` from a rounds-per-second fire rate
with `1000 / roundsPerSecond`.

```ts
const rifle: WeaponRuntime<THREE.Camera, Enemy> = createWeaponRuntime({
  cadenceMs: 1000 / 8, // 8 rounds/sec
  magazine: { capacity: 30, reloadMs: 1800, reserve: 120 },
  resolveHits: (camera) => raycastFromCamera(camera),
  damageFor: (enemy): DamageHitInput => ({
    channel: "kinetic",
    impact: 24,
    target: enemy.id,
    targetTraits: enemy.armored ? ["armored"] : [],
    matchup: { entries: { kinetic: { armored: { impact: 0.5 } } } },
  }),
});
```

## Fire, tick, and apply results

```ts
// Your input handler:
function onTriggerDown(camera: THREE.Camera): void {
  const result = rifle.fire(camera);
  if (result.status === "fired") {
    playMuzzleFlash();
    for (const hit of result.resolutions) {
      // Apply the resolved impact to YOUR health store, spawn YOUR hit spark, etc.
      applyDamageToMyEntities(hit); // hit.impact, hit.channel, hit.status, hit.received
    }
  } else if (result.status === "empty") {
    rifle.startReload();
    playReloadAnim();
  } // "cooling" and "reloading" are silent no-ops you can ignore or feed to the HUD
}

// Your frame loop:
function update(dtSeconds: number): void {
  rifle.tick(dtSeconds); // advances cadence + reload timers
  hud.setAmmo(rifle.magazine?.loaded() ?? Infinity, rifle.magazine?.reserve() ?? null);
  hud.setReload(rifle.magazine?.reloadFraction() ?? 0);
}
```

`resolveHits` and `damageFor` are only called on a `"fired"` result, so a blocked
trigger pull never touches your raycaster or ammo.

## Bring your own ammo economy

Point the magazine's `reserve` at a caller-owned pool with a `MagazineReserve`
adapter instead of a plain number, so reloads draw from your shared inventory:

```ts
import type { MagazineReserve } from "@jgengine/core/combat";

const backpack = { rifleAmmo: 240 };
const reserve: MagazineReserve = {
  current: () => backpack.rifleAmmo,
  spend: (n) => (n <= backpack.rifleAmmo ? ((backpack.rifleAmmo -= n), true) : false),
  gain: (n) => { backpack.rifleAmmo += n; },
};
// magazine: { capacity: 30, reloadMs: 1800, reserve }
```

## Save and restore

The magazine exposes `loaded()`/`reserve()`/`reloadFraction()` and the cadence
exposes `elapsedMs()`/`restore()` for HUD and snapshots:

```ts
const snapshot = {
  cadenceMs: rifle.cadence.elapsedMs(),
  loaded: rifle.magazine?.loaded() ?? null,
};
// After load: recreate the runtime from the same config, then:
rifle.cadence.restore(snapshot.cadenceMs);
```

Recreate the magazine at its saved `loaded` via `MagazineConfig.loaded`. (Full
magazine snapshot/restore lands with the serializable-runtime-state slice.)

## Ownership

The existing project keeps entities, meshes, the raycaster, aim, input, camera,
muzzle flash, audio, animation, the health/damage sink, ammo inventory, weapon
content and stats, and when the trigger fires. JGengine owns fire-rate gating,
magazine/reload bookkeeping, and deterministic damage resolution (matchup,
receiver modifiers, status rolls) with full provenance.

## Common traps

- `fire()` gates in order **reloading → cooling → empty**; a `"cooling"` result
  means the cadence, not the magazine, blocked the shot. Tick before expecting
  `"empty"`.
- Only a `"fired"` result spends a round and resets cadence; blocked attempts are
  free, so you can call `fire()` every input frame.
- Firing does not auto-reload or fire-cancel a reload; call `startReload()` /
  `cancelReload()` from your own input policy.
- `damageFor` returning `null` keeps the hit in `result.hits` but produces no
  `DamageHitResolution` — use it for terrain/props your raycast also returns.
- Pass a seeded `rng` in the config for deterministic status rolls in multiplayer
  authority, replays, or tests; per-hit `DamageHitInput.rng` overrides it.
- Convert fire rate to `cadenceMs` with `1000 / roundsPerSecond`, not the reverse.
