import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, TorusGeometry, Vector3 } from "three";
import type { BufferGeometry, Material } from "three";
import { useRef, useState } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { WeatherLayer } from "@jgengine/core/weather/WeatherLayer.draw";
import { airAt, gust } from "./air";
import { zoneAt } from "./zones";
import { equippedGun, gameNow, muzzleFlashVisible, recoilAt } from "../feel";
import { gunById, isReloading, type GunDef, type GunFamily } from "../handroll";
import { handlingView } from "../handling";
import { ELEMENT_COLORS } from "../palette";
import { SalvageRelay } from "./Relay";
import { QuestMarker } from "./QuestMarker";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

/**
 * Blaster silhouettes, built from primitives rather than cast from a model pack.
 *
 * No pack we ship has a gun, and the previous casting pointed the player's weapon at fantasy melee
 * meshes — a *dagger* stood in for the pistol, a crossbow for the SMG, an axe for the shotgun. In a
 * first-person shooter that mesh is on screen every single frame, so it was the most-seen wrong
 * asset in the game. Composed boxes read as a machined sci-fi weapon and take their proportions from
 * the family, which a fantasy axe never could.
 */
interface BlasterSpec {
  /** Receiver block: width, height, length in metres. */
  body: readonly [number, number, number];
  /** Barrel: radius, length. */
  barrel: readonly [number, number];
  /** Boxy magazine below the receiver, or `null` for none. */
  magazine: readonly [number, number, number] | null;
  /** Optic block above the receiver, or `null` for iron sights. */
  optic: readonly [number, number, number] | null;
  /** Muzzle-brake plate at the barrel tip — shotguns and launchers flare. */
  brake: number | null;
}

const FAMILY_BLASTER: Record<GunFamily, BlasterSpec> = {
  pistol: {
    body: [0.055, 0.1, 0.2],
    barrel: [0.017, 0.12],
    magazine: [0.045, 0.09, 0.05],
    optic: null,
    brake: null,
  },
  smg: {
    body: [0.06, 0.1, 0.26],
    barrel: [0.015, 0.14],
    magazine: [0.04, 0.16, 0.05],
    optic: [0.03, 0.025, 0.07],
    brake: null,
  },
  shotgun: {
    body: [0.075, 0.11, 0.34],
    barrel: [0.028, 0.26],
    magazine: null,
    optic: null,
    brake: 0.05,
  },
  rifle: {
    body: [0.065, 0.11, 0.38],
    barrel: [0.019, 0.24],
    magazine: [0.045, 0.14, 0.06],
    optic: [0.035, 0.035, 0.11],
    brake: null,
  },
  sniper: {
    body: [0.06, 0.1, 0.44],
    barrel: [0.017, 0.34],
    magazine: [0.04, 0.1, 0.05],
    optic: [0.042, 0.045, 0.18],
    brake: 0.032,
  },
  launcher: {
    body: [0.09, 0.13, 0.36],
    barrel: [0.055, 0.24],
    magazine: null,
    optic: [0.03, 0.03, 0.08],
    brake: 0.085,
  },
};

const MANUFACTURER_COLORS: Record<string, string> = {
  Blackwood: "#6e4a2c",
  Apex: "#c9c4b8",
  Voltek: "#2c4a6e",
  Chuckwerk: "#5a6a5e",
  Detonic: "#7a2c1e",
  Ironworks: "#5e3a2c",
  Vanguard: "#4e5a3c",
  Scrapjack: "#5a5248",
};

/**
 * The lit trim colour each brand signs its guns with. The plating hues above are body paint — dark
 * enough to sit under a desert sun without glaring, and therefore too dark to tell apart on a weapon
 * that occupies a hand's width of screen. One saturated emissive line per brand is what actually
 * reads at that size, and it survives the shaded side of the gun where paint does not.
 */
const MANUFACTURER_ACCENTS: Record<string, string> = {
  Blackwood: "#ffae4a",
  Apex: "#eaf2ff",
  Voltek: "#4bb8ff",
  Chuckwerk: "#9ee06a",
  Detonic: "#ff5a2e",
  Ironworks: "#ffc64a",
  Vanguard: "#7fe0c0",
  Scrapjack: "#c98cff",
};

/**
 * Finishes, split by what a part is made of rather than one grey for the whole weapon. Machined
 * steel takes a low roughness and reads by its highlight; polymer takes a high roughness and reads
 * by staying dark, and the value gap between the two is what stops the gun looking like one box.
 *
 * `emissive` here is not a light source — it stands in for the image-based lighting this scene does
 * not have. A first-person weapon sits half a metre from the eye, mostly turned away from the key,
 * and a PBR metal with no environment map has almost no diffuse term, so an honest receiver renders
 * as a black cut-out against bright sand. A small self-lit floor per part gives the metal its own
 * ambient and keeps the machined/polymer split legible in shade.
 */
const FINISH = {
  /** Receiver and frame: machined, mid-value, the part the silhouette is made of. */
  receiver: { color: "#59616a", metalness: 0.45, roughness: 0.36, emissive: "#39424c", emissiveIntensity: 0.35 },
  /** Rail, bolt, muzzle collar: polished steel highlights that draw the top edge of the silhouette. */
  bright: { color: "#aeb7bf", metalness: 0.72, roughness: 0.18, emissive: "#5d6873", emissiveIntensity: 0.25 },
  /** Blued barrel — darker than the receiver so the bore end reads as a separate part. */
  barrel: { color: "#454d55", metalness: 0.82, roughness: 0.24, emissive: "#252c34", emissiveIntensity: 0.35 },
  /** Grip, magazine, optic body, foregrip: moulded polymer, matte and near-black. */
  polymer: { color: "#1e2228", metalness: 0.04, roughness: 0.86, emissive: "#12161b", emissiveIntensity: 0.35 },
} as const;

/**
 * Where the muzzle flash sits, derived from the family's own barrel geometry rather than a
 * hand-tuned table — a table drifts out of sync the moment a barrel length changes. Matches the
 * blaster group's own `position` and `rotation={[0, PI, 0]}`, so the sign is already flipped.
 */
/** The muzzle light's intensity while a flash shows. */
const FLASH_LIGHT = 5;

function muzzleOffsetZ(family: GunFamily): number {
  const spec = FAMILY_BLASTER[family];
  const tip = spec.body[2] / 2 + spec.barrel[1] + (spec.brake === null ? 0 : 0.045);
  return -(tip - 0.1);
}

/** Barrel-shroud vent slots, spaced along whatever barrel the family actually has. */
function addVents(parent: Group, owned: BufferGeometry[], barrelR: number, barrelZ: number, barrelL: number, y: number, material: Material): void {
  const slots = barrelL < 0.16 ? 2 : 3;
  const step = (barrelL * 0.6) / slots;
  for (let index = 0; index < slots; index += 1) {
    const geometry = new BoxGeometry(barrelR * 2.3, barrelR * 0.5, barrelR * 0.6);
    owned.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, y + barrelR * 0.9, barrelZ + barrelL * 0.24 - index * step);
    parent.add(mesh);
  }
}

/**
 * Builds one gun's mesh tree imperatively — the same parts the old JSX composed, with materials
 * cached per finish and every geometry/material handed back for disposal on a gun swap.
 */
function buildGun(gun: GunDef): { group: Group; flash: Group; muzzleZ: number; dispose(): void } {
  const spec = FAMILY_BLASTER[gun.family];
  const group = new Group();
  group.rotation.set(0, Math.PI, 0);
  group.position.set(0, -0.02, -0.1);
  const ownedGeometries: BufferGeometry[] = [];
  const ownedMaterials: Material[] = [];
  const finishMaterials = new Map<keyof typeof FINISH, MeshStandardMaterial>();
  const finish = (key: keyof typeof FINISH): MeshStandardMaterial => {
    let material = finishMaterials.get(key);
    if (material === undefined) {
      material = new MeshStandardMaterial({ ...FINISH[key] });
      finishMaterials.set(key, material);
      ownedMaterials.push(material);
    }
    return material;
  };
  const extraMaterials: Material[] = [];
  const plating = new MeshStandardMaterial({ color: MANUFACTURER_COLORS[gun.manufacturer] ?? "#7a6a58", metalness: 0.3, roughness: 0.5 });
  const accent = new MeshStandardMaterial({ color: MANUFACTURER_ACCENTS[gun.manufacturer] ?? "#ffb400", emissive: MANUFACTURER_ACCENTS[gun.manufacturer] ?? "#ffb400", emissiveIntensity: 1.1, roughness: 0.35 });
  extraMaterials.push(plating, accent);
  const glow = gun.element !== "none" ? ELEMENT_COLORS[gun.element] : null;
  const glowMaterial = glow === null ? null : new MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.8, roughness: 0.3 });
  if (glowMaterial !== null) extraMaterials.push(glowMaterial);
  const lensMaterial = new MeshStandardMaterial({ color: "#3fd8ff", emissive: "#3fd8ff", emissiveIntensity: 2.2, roughness: 0.2 });
  extraMaterials.push(lensMaterial);

  const geo = <T extends BufferGeometry>(geometry: T): T => { ownedGeometries.push(geometry); return geometry; };
  const part = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number, rotation?: readonly [number, number, number]): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rotation !== undefined) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    group.add(mesh);
    return mesh;
  };

  const [bodyW, bodyH, bodyL] = spec.body;
  const [barrelR, barrelL] = spec.barrel;
  const barrelZ = -(bodyL / 2 + barrelL / 2);
  const barrelY = bodyH * 0.16;
  const braced = spec.optic !== null;

  // Receiver
  part(geo(new BoxGeometry(bodyW, bodyH, bodyL)), finish("receiver"), 0, 0, 0);
  // Polished top rail — the one part that always catches the sky.
  part(geo(new BoxGeometry(bodyW * 0.5, 0.008, bodyL * 0.82)), finish("bright"), 0, bodyH / 2 + 0.004, -bodyL * 0.04);
  // Manufacturer plating along both receiver flanks.
  part(geo(new BoxGeometry(0.008, bodyH * 0.55, bodyL * 0.7)), plating, bodyW / 2 + 0.004, bodyH * 0.1, 0);
  part(geo(new BoxGeometry(0.008, bodyH * 0.55, bodyL * 0.7)), plating, -(bodyW / 2 + 0.004), bodyH * 0.1, 0);
  // Brand accent line, both flanks, riding the bottom of the plating.
  part(geo(new BoxGeometry(0.004, bodyH * 0.1, bodyL * 0.58)), accent, bodyW / 2 + 0.009, -bodyH * 0.1, 0);
  part(geo(new BoxGeometry(0.004, bodyH * 0.1, bodyL * 0.58)), accent, -(bodyW / 2 + 0.009), -bodyH * 0.1, 0);
  // Ejection port and charging handle.
  part(geo(new BoxGeometry(0.007, bodyH * 0.24, bodyL * 0.2)), finish("polymer"), bodyW / 2 + 0.005, bodyH * 0.18, -bodyL * 0.1);
  part(geo(new CylinderGeometry(0.008, 0.008, 0.03, 8)), finish("bright"), bodyW / 2 + 0.014, bodyH * 0.3, bodyL * 0.16, [0, 0, Math.PI / 2]);
  // Barrel, muzzle collar, optional brake.
  part(geo(new CylinderGeometry(barrelR, barrelR, barrelL, 12)), finish("barrel"), 0, barrelY, barrelZ, [Math.PI / 2, 0, 0]);
  addVents(group, ownedGeometries, barrelR, barrelZ, barrelL, barrelY, finish("polymer"));
  part(geo(new CylinderGeometry(barrelR * 1.25, barrelR * 1.25, 0.016, 12)), finish("bright"), 0, barrelY, barrelZ - barrelL / 2 + 0.008, [Math.PI / 2, 0, 0]);
  if (spec.brake !== null) {
    part(geo(new CylinderGeometry(spec.brake, barrelR * 1.2, 0.045, 12)), finish("barrel"), 0, barrelY, barrelZ - barrelL / 2, [Math.PI / 2, 0, 0]);
  }
  // Grip, trigger guard, braced foregrip.
  part(geo(new BoxGeometry(bodyW * 0.8, bodyH * 0.9, bodyL * 0.22)), finish("polymer"), 0, -(bodyH * 0.62), bodyL * 0.3, [0.32, 0, 0]);
  part(geo(new TorusGeometry(bodyH * 0.24, 0.005, 6, 14)), finish("receiver"), 0, -(bodyH * 0.5), bodyL * 0.16, [0, Math.PI / 2, 0]);
  if (braced) {
    part(geo(new BoxGeometry(bodyW * 0.55, 0.055, bodyL * 0.13)), finish("polymer"), 0, barrelY - barrelR - 0.028, barrelZ + barrelL * 0.18, [0.22, 0, 0]);
  }
  if (spec.magazine !== null) {
    part(geo(new BoxGeometry(spec.magazine[0], spec.magazine[1], spec.magazine[2])), finish("polymer"), 0, -(bodyH / 2 + spec.magazine[1] / 2), -bodyL * 0.08);
  }
  if (spec.optic !== null) {
    part(geo(new BoxGeometry(spec.optic[0], spec.optic[1], spec.optic[2])), finish("polymer"), 0, bodyH / 2 + spec.optic[1] / 2 + 0.006, bodyL * 0.05);
    // Lit optic lens — the same cold cyan the machines' optics use.
    part(geo(new CircleGeometry(spec.optic[1] * 0.42, 12)), lensMaterial, 0, bodyH / 2 + spec.optic[1] / 2 + 0.006, bodyL * 0.05 - spec.optic[2] / 2 - 0.002, [0, Math.PI, 0]);
  } else {
    // Iron sights when there is no optic.
    part(geo(new BoxGeometry(0.005, 0.016, 0.005)), finish("bright"), 0, bodyH / 2 + 0.012, -bodyL * 0.4);
    part(geo(new BoxGeometry(0.018, 0.012, 0.005)), finish("bright"), 0, bodyH / 2 + 0.011, bodyL * 0.36);
  }
  // Element charge cell: the loudest emissive on the gun.
  if (glowMaterial !== null) {
    part(geo(new BoxGeometry(bodyW * 1.06, bodyH * 0.2, bodyL * 0.18)), glowMaterial, 0, bodyH * 0.05, bodyL * 0.12);
  }

  const muzzleZ = muzzleOffsetZ(gun.family);
  const flash = new Group();
  flash.position.set(0, 0.012, muzzleZ);
  flash.visible = false;
  const flashGeometry = geo(new PlaneGeometry(0.11, 0.11));
  const flashMaterialA = new MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.9, depthWrite: false });
  const flashMaterialB = new MeshBasicMaterial({ color: "#ff9a3e", transparent: true, opacity: 0.8, depthWrite: false });
  ownedMaterials.push(flashMaterialA, flashMaterialB);
  const flashA = new Mesh(flashGeometry, flashMaterialA);
  const flashB = new Mesh(flashGeometry, flashMaterialB);
  flashB.rotation.y = Math.PI / 2;
  flash.add(flashA, flashB);
  group.add(flash);

  return {
    group,
    flash,
    muzzleZ,
    dispose() {
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const material of finishMaterials.values()) material.dispose();
    },
  };
}

/**
 * The air the player stands in. Dust density, drift, and colour come from the zone's one air
 * description — the same numbers driving the wind bed — so a gust is heard and seen at once, and
 * the Blight's violet reactor ash reads as a different place from Rustflat's sand.
 */
function FerralonAir() {
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

export function FerralonWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding />
      <FerralonAir />
      <SalvageRelay />
      <FerralonViewmodel />
      <QuestMarker />
    </>
  );
}

/**
 * The first-person rig as one draw: the gun group (rebuilt on weapon swap), the muzzle flash and
 * its light all live under a camera-posed group updated every frame — no React state, no refs.
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

export function FerralonViewmodel() {
  const ctx = useGameContext();
  const gunId = equippedGun();
  const gun = gunId === null ? undefined : gunById(gunId);
  const latest = useRef({ ctx, gun });
  latest.current = { ctx, gun };
  return <EngineDrawMount create={() => viewmodelDraw(() => latest.current)} deps={[ctx]} />;
}
