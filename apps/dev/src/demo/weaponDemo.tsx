import type { ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { CameraWeaponView } from "@jgengine/core/game/playableGame";
import { createFireCadence, type FireCadence } from "@jgengine/core/combat/weaponFire";
import {
  createWeaponHandling,
  type WeaponHandling,
  type WeaponHandlingFrame,
  type WeaponHandlingTuning,
} from "@jgengine/core/combat/weaponHandling";
import type { WeaponPresentationTuning } from "@jgengine/core/combat/weaponPresentation";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { useGameStore } from "@jgengine/react/hooks";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const deg = (value: number) => (value * Math.PI) / 180;

interface DemoWeapon {
  name: string;
  intervalMs: number;
  handling: WeaponHandlingTuning;
  presentation: WeaponPresentationTuning;
}

const RIFLE: DemoWeapon = {
  name: "Rifle",
  intervalMs: 100,
  handling: {
    recoil: {
      pattern: [[deg(0.6), 0], [deg(0.7), deg(0.1)], [deg(0.8), deg(-0.15)], [deg(0.7), deg(0.2)], [deg(0.5), deg(-0.2)]],
      cameraShare: 0.3,
      recoverRate: deg(12),
      recoverDelay: 0.16,
      adsScale: 0.7,
    },
    spread: { base: deg(0.4), perShot: deg(0.12), max: deg(2.5), recoverRate: deg(6), recoverDelay: 0.16, ads: 0.35, moving: 1.8 },
    adsTime: 0.22,
  },
  presentation: {
    hip: [0.3, -0.24, -0.7],
    ads: [0, -0.07, -0.55],
    viewmodelFov: { hip: 62, ads: 58 },
    adsZoom: 0.78,
    sway: { perRadPerSec: 0.015, max: 0.05 },
    kick: { back: 0.8, rise: 1 },
  },
};

const SHOTGUN: DemoWeapon = {
  name: "Shotgun",
  intervalMs: 900,
  handling: {
    recoil: { pitch: deg(6), randomCone: deg(1.5), cameraShare: 0.6, recoverRate: deg(20), recoverDelay: 0.15 },
    spread: { base: deg(4), perShot: deg(1), max: deg(6), recoverRate: deg(8), recoverDelay: 0.2, ads: 0.8 },
    adsTime: 0.3,
  },
  presentation: {
    hip: [0.38, -0.32, -0.62],
    ads: [0.12, -0.16, -0.5],
    viewmodelFov: { hip: 74, ads: 66 },
    adsZoom: 0.92,
    sway: { perRadPerSec: 0.035, max: 0.1, response: 7 },
    bob: { amplitude: [0.02, 0.016] },
    kick: { back: 1.6, rise: 2.4 },
  },
};

const WEAPONS = [RIFLE, SHOTGUN] as const;

interface Held {
  weapon: DemoWeapon;
  handling: WeaponHandling;
  cadence: FireCadence;
  view: CameraWeaponView;
  shots: number;
}

function hold(weapon: DemoWeapon): Held {
  const handling = createWeaponHandling(weapon.handling, { random: seededRng(`weapon-demo:${weapon.name}`) });
  return {
    weapon,
    handling,
    cadence: createFireCadence({ intervalMs: weapon.intervalMs }),
    view: { handling: handling.frame(), presentation: weapon.presentation },
    shots: 0,
  };
}

let held = hold(RIFLE);
let frame: WeaponHandlingFrame = held.handling.frame();
// Capture states latch these so a screenshot can hold ADS or a trigger without a key down.
let aimLatched = false;
let fireLatched = false;

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 4 }, role: "player" },
};

const game = defineGameDefinition({
  name: "weapon-handling",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    fire: ["mouse0", "KeyF"],
    aim: ["mouse2", "KeyE"],
    rifle: ["Digit1"],
    shotgun: ["Digit2"],
  },
});

function onInit(ctx: GameContext): void {
  held = hold(RIFLE);
  frame = held.handling.frame();
  aimLatched = false;
  fireLatched = false;
  ctx.game.commands.define("weapon.rifle", { apply: () => void (held = hold(RIFLE)) });
  ctx.game.commands.define("weapon.shotgun", { apply: () => void (held = hold(SHOTGUN)) });
  ctx.game.commands.define("weapon.aim", { apply: () => void (aimLatched = true) });
  ctx.game.commands.define("weapon.holdFire", { apply: () => void (fireLatched = true) });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, -6], rotationY: 0, role: "player" });
}

function onTick(ctx: GameContext, dt: number): void {
  if (ctx.input.justPressed("rifle") && held.weapon !== RIFLE) held = hold(RIFLE);
  if (ctx.input.justPressed("shotgun") && held.weapon !== SHOTGUN) held = hold(SHOTGUN);
  const moving = ["moveForward", "moveBack", "moveLeft", "moveRight"].some((action) => ctx.input.isDown(action));
  const stance = { ads: aimLatched || ctx.input.isDown("aim"), moving };
  held.cadence.tick(dt);
  if ((fireLatched || ctx.input.isDown("fire")) && held.cadence.fire()) {
    held.handling.fire(stance);
    held.shots += 1;
  }
  frame = held.handling.tick(dt, stance);
  held.view.handling = frame;
}

function Range(): ReactNode {
  const targets = [-6, -2, 2, 6];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 10]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#56606b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3, 22]} receiveShadow>
        <boxGeometry args={[30, 6, 0.6]} />
        <meshStandardMaterial color="#9a8a73" roughness={0.9} />
      </mesh>
      {targets.map((x) => (
        <group key={x} position={[x, 0, 16]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.12, 1.2, 0.12]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <boxGeometry args={[1.1, 1.1, 0.08]} />
            <meshStandardMaterial color="#f5f5f4" />
          </mesh>
          <mesh position={[0, 1.7, 0.05]}>
            <circleGeometry args={[0.28, 24]} />
            <meshStandardMaterial color="#dc2626" />
          </mesh>
        </group>
      ))}
      {[-9, -3, 3, 9].map((z) => (
        <mesh key={z} position={[5, 0.5, z + 4]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#b45309" roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

function WeaponHud(): ReactNode {
  useGameStore((ctx) => ctx.version());
  const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);
  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100">
      <div className="text-base font-bold">{held.weapon.name}</div>
      <div className="tabular-nums">spread {toDeg(frame.spread)}° · climb {toDeg(frame.aimPitch)}°</div>
      <div className="tabular-nums">ADS {(frame.adsProgress * 100).toFixed(0)}% · shots {held.shots}</div>
      <div className="mt-1 text-[10px] text-slate-400">LMB/F fire · RMB/E aim · 1 rifle · 2 shotgun</div>
    </div>
  );
}

function makeGame(rig: "first" | "shoulder"): PlayableGame {
  return {
    game,
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: { onInit, onNewPlayer, onTick, onReset: onInit, onDispose: () => {} },
    GameUI: WeaponHud,
    environment: () => <Range />,
    backdrop: { sky: { preset: "day" } },
    camera: {
      rig,
      firstPerson: { eyeHeight: 1.6 },
      shoulder: { shoulderOffset: 0.8, distance: 3, heightOffset: 1.6, ads: { distance: 1.9, shoulderOffset: 0.85, fov: 42 } },
      weapon: () => held.view,
    },
    capture: {
      states: {
        "rifle-ads": ["weapon.aim"],
        "rifle-spray": ["weapon.holdFire"],
        "rifle-ads-spray": ["weapon.aim", "weapon.holdFire"],
        "shotgun-hip": ["weapon.shotgun"],
        "shotgun-ads": ["weapon.shotgun", "weapon.aim"],
      },
      probe: (): Record<string, number> => ({
        weapon: WEAPONS.indexOf(held.weapon as (typeof WEAPONS)[number]),
        shots: held.shots,
        aimPitchDeg: (frame.aimPitch * 180) / Math.PI,
        cameraPitchDeg: (frame.cameraPitch * 180) / Math.PI,
        spreadDeg: (frame.spread * 180) / Math.PI,
        ads: frame.adsProgress,
      }),
    },
  };
}

/** Dev demo for `createWeaponHandling` + `createWeaponPresentation`: a rifle and a shotgun on a range. */
export const weaponDemoGame: PlayableGame = makeGame("first");
/** The same weapons over the shoulder: ADS and recoil come from the same handling frame. */
export const weaponShoulderDemoGame: PlayableGame = makeGame("shoulder");
