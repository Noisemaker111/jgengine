/** @jsxImportSource @jgengine/core/ui/jsx */
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight, Vector3 } from "three";
import { buildJunkWeapon } from "./junkModel";
import { useRef, useState } from "@jgengine/core/ui/jsx";
import { useGameContext } from "@jgengine/ui/provider";
import { WeatherLayer } from "@jgengine/core/weather/WeatherLayer.draw";
import { airAt, gust } from "./air";
import { zoneAt } from "./zones";
import { equippedGun, gameNow, muzzleFlashVisible, recoilAt } from "../feel";
import { gunById, isReloading, type GunDef } from "../handroll";
import { handlingView } from "../handling";
import { ELEMENT_COLORS } from "../palette";
import { SalvageRelay } from "./Relay";
import { QuestMarker } from "./QuestMarker";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** The muzzle light's intensity while a flash shows. */
const FLASH_LIGHT = 5;

/**
 * One weapon's mesh tree: the junk itself (`junkModel.ts`: body, mod, googly eyes, wear) and a
 * muzzle flash at the tip of whatever body it is. Every geometry and material goes back for disposal.
 */
function buildGun(gun: GunDef): { group: Group; flash: Group; muzzleZ: number; dispose(): void } {
  const junk = buildJunkWeapon(gun);
  const group = junk.group;
  group.position.set(0, -0.02, -0.1);
  const flash = new Group();
  flash.position.set(0, junk.muzzleY, junk.muzzleZ - 0.01);
  flash.visible = false;
  const flashGeometry = new PlaneGeometry(0.11, 0.11);
  const flashColor = gun.element === "none" ? "#ffd76a" : ELEMENT_COLORS[gun.element];
  const flashMaterialA = new MeshBasicMaterial({ color: flashColor, transparent: true, opacity: 0.9, depthWrite: false });
  const flashMaterialB = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false });
  const flashA = new Mesh(flashGeometry, flashMaterialA);
  const flashB = new Mesh(flashGeometry, flashMaterialB);
  flashB.rotation.y = Math.PI / 2;
  flash.add(flashA, flashB);
  group.add(flash);
  return {
    group,
    flash,
    muzzleZ: junk.muzzleZ - 0.1,
    dispose() {
      junk.dispose();
      flashGeometry.dispose();
      flashMaterialA.dispose();
      flashMaterialB.dispose();
    },
  };
}

/**
 * The air the player stands in. Dust density, drift, and colour come from the zone's one air
 * description — the same numbers driving the wind bed — so a gust is heard and seen at once, and
 * the Estates' violet Wi-Fi haze reads as a different place from Crabgrass Court's pollen.
 */
function SuburbAir() {
  const ctx = useGameContext();
  const host = useEngineHost();
  const [air, setAir] = useState(() => airAt(null));
  const [strength, setStrength] = useState(1);
  const zoneId = useRef<string | null>(null);

  useFrameTask(() => {
    const camera = host.frame.camera;
    const zone = zoneAt(camera.position.x, camera.position.z);
    const nextId = zone?.id ?? null;
    if (nextId !== zoneId.current) {
      zoneId.current = nextId;
      setAir(airAt(nextId));
    }
    // Quantised so a continuous gust curve does not re-render every frame.
    const next = Math.round(gust(ctx.time.now() * 1000) * 20) / 20;
    setStrength((current) => (current === next ? current : next));
  });

  const blow = air.wind * strength;
  return (
    <WeatherLayer
      mode="dust"
      intensity={0.35 + blow * 0.85}
      wind={[blow * 3.4 * air.rate, 0, blow * 1.6 * air.rate]}
      dust={{
        color: air.dust,
        // Grit, not weather. At the old opacity and size the motes that happened to sit above the
        // camera projected onto the sky as discrete bright dots — read as render noise, or snow, not
        // as dusty air. Small and faint is what makes a mote read as suspended dust.
        opacity: 0.1 + blow * 0.14,
        size: 0.11,
        speed: 1.6 + blow * 3.2,
        // Tighter than the default volume so the motes concentrate in the near field where the
        // parallax actually reads, instead of thinning out across 70 m of empty air. The 15 m column
        // put a third of the field above eye level; blown sand does not hang at rooftop height in
        // still air, and against an open sky every mote up there was a speck with nothing behind it.
        volume: [44, 5, 44],
        // Packs the field into the metre either side of the ground plane, where wind-carried grit
        // actually lives and where there is terrain behind it to read against. A 5 m column also
        // puts the layer's own top fade below eye level, so the few motes that do ride high are
        // already fading out rather than popping against open sky.
        groundBias: 0.92,
      }}
    />
  );
}

export function SuburbWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding />
      <SuburbAir />
      <SalvageRelay />
      <JunkViewmodel />
      <QuestMarker />
    </>
  );
}

/**
 * The first-person rig as one draw: the gun group (rebuilt on weapon swap), the muzzle flash and
 * its light all live under a camera-posed group updated every frame — no UI state, no refs.
 */
function viewmodelDraw(get: () => { ctx: GameContext; gun: GunDef | undefined }): EngineDraw {
  const rig = new Group();
  rig.renderOrder = 999;
  // Mounted with or without a gun, outside the hidden flash group, and dimmed between shots: hiding or
  // unmounting a light changes the scene's light count, and every lit material recompiles.
  const flashLight = new PointLight("#ffb347", 0, 3);
  rig.add(flashLight);
  const lastCameraPos = new Vector3();
  let bobTime = 0;
  let lastGun: GunDef | undefined | null = null;
  let gunLease: { group: Group; flash: Group; muzzleZ: number; dispose(): void } | null = null;

  const syncGun = (gun: GunDef | undefined) => {
    if (gun === lastGun) return;
    lastGun = gun;
    if (gunLease !== null) {
      rig.remove(gunLease.group);
      gunLease.dispose();
      gunLease = null;
    }
    if (gun !== undefined) {
      gunLease = buildGun(gun);
      rig.add(gunLease.group);
      flashLight.position.set(0, 0.012, gunLease.muzzleZ);
    } else {
      flashLight.position.set(0, 0.012, 0);
    }
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(rig);
    },
    frame(state: EngineFrameState, dt: number) {
      const { ctx, gun } = get();
      syncGun(gun);
      const camera = state.camera;
      const nowMs = gameNow();

      const speed = lastCameraPos.distanceTo(camera.position) / Math.max(dt, 1 / 240);
      lastCameraPos.copy(camera.position);
      const moving = Math.min(1, speed / 6);
      bobTime += dt * (4 + moving * 6);

      const recoil = recoilAt(nowMs);

      let reloadDip = 0;
      let reloadSpin = 0;
      if (gun !== undefined && isReloading(ctx, gun)) {
        reloadDip = 0.16;
        reloadSpin = Math.sin(state.clock.elapsedTime * 9) * 0.35;
      }

      // Aimed, the gun comes up to the centre line and the walk bob mostly settles.
      const ads = handlingView(ctx)?.handling.adsProgress ?? 0;
      const bob = (0.4 + moving) * (1 - ads * 0.75);
      rig.position.copy(camera.position);
      rig.quaternion.copy(camera.quaternion);
      rig.translateX(0.24 * (1 - ads) + Math.sin(bobTime) * 0.006 * bob);
      rig.translateY(-0.24 + ads * 0.125 - reloadDip + Math.abs(Math.cos(bobTime)) * 0.009 * bob + recoil * 0.02);
      rig.translateZ(-0.5 + ads * 0.08 + recoil * 0.07);
      rig.rotateX(recoil * 0.09 - reloadSpin * 0.6);
      rig.rotateZ(reloadSpin * 0.12);

      const flash = gunLease?.flash ?? null;
      const visible = muzzleFlashVisible(nowMs);
      if (flash !== null) {
        flash.visible = visible;
        if (visible) flash.rotation.z = (nowMs % 97) / 15;
      }
      flashLight.intensity = visible ? FLASH_LIGHT : 0;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(rig);
      rig.clear();
      if (gunLease !== null) gunLease.dispose();
      gunLease = null;
      flashLight.dispose();
    },
  };
}

export function JunkViewmodel() {
  const ctx = useGameContext();
  const gunId = equippedGun();
  const gun = gunId === null ? undefined : gunById(gunId);
  const latest = useRef({ ctx, gun });
  latest.current = { ctx, gun };
  return <EngineDrawMount create={() => viewmodelDraw(() => latest.current)} deps={[ctx]} />;
}
