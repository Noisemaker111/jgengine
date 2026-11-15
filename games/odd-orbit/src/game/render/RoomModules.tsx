/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/ui/provider";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { boardingOf, houseView, noVacancy, roomBySlot, tenantComfort } from "../boarding/boarding";
import { AIRLOCK, BERTHS, BERTH_SIZE } from "../boarding/layout";
import { effectiveRoom, ROOM_SLOTS, type RoomState } from "../boarding/rooms";
import type { Atmosphere, Climate, Light } from "../boarding/species";
import { householdStore } from "../session/store";
import type { HouseholdState } from "../session/types";
import { AIR_COLOR, CLIMATE_COLOR, LIGHT_COLOR, STATION } from "../palette";
import { SPECIES } from "../boarding/species";
import { buildTenantRig } from "./TenantMesh";

/**
 * The boarding house's modules, drawn from the room model: a chunky cut-away box per docked berth
 * (floor tinted by its air, a porthole and ceiling strip in its light, a rim in its warmth, a gasket
 * when sealed), a comfort lamp over each door, a haze where the wrong air seeps through a wall, a
 * scaffold outline on berths still for sale, the corridor from the airlock, and the neon sign that
 * gives the place its name. Rebuilt only when the house changes; lamps and haze animate per frame.
 */

const LIGHT_LEVEL: Record<Light, number> = { dark: 0.15, dim: 0.9, bright: 2.2 };
const WALL_H = 2.3;

const geo = { box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 18, 12), torus: new THREE.TorusGeometry(1, 0.12, 8, 28), circle: new THREE.CircleGeometry(1, 28) };

function block(material: THREE.Material, size: [number, number, number], at: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo.box, material);
  m.scale.set(...size);
  m.position.set(...at);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

interface Animated { lamp?: THREE.MeshStandardMaterial; haze?: THREE.Mesh; motes?: THREE.Mesh[]; phase: number }

function comfortColor(score: number): string {
  return score >= 80 ? "#5ef2a4" : score >= 55 ? "#c6f26b" : score >= 30 ? "#ffc35c" : "#ff5d73";
}

function buildRoom(state: HouseholdState, room: RoomState, now: number, anims: Animated[]): THREE.Group {
  const pose = BERTHS[room.slot]!;
  const g = new THREE.Group();
  g.position.set(pose.x, 0, pose.z);
  g.rotation.y = pose.rotation;
  const { w, d } = BERTH_SIZE;
  const eff = effectiveRoom(houseView(state, now), room);
  const s = eff.settings;
  const shell = new THREE.MeshStandardMaterial({ color: STATION.module, roughness: 0.5, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: STATION.trim, roughness: 0.4, metalness: 0.4 });
  const airTint = AIR_COLOR[s.atmosphere as Atmosphere];
  const floor = new THREE.MeshStandardMaterial({ color: airTint, roughness: 0.7, emissive: airTint, emissiveIntensity: 0.12 });
  const lightColor = LIGHT_COLOR[s.light as Light];
  const glowMat = new THREE.MeshStandardMaterial({ color: lightColor, emissive: lightColor, emissiveIntensity: LIGHT_LEVEL[s.light as Light] });
  const rim = new THREE.MeshStandardMaterial({ color: CLIMATE_COLOR[s.climate as Climate], emissive: CLIMATE_COLOR[s.climate as Climate], emissiveIntensity: s.climate === "temperate" ? 0.05 : 0.6 });
  // Slab, inset floor and climate rim.
  g.add(block(trim, [w + 0.3, 0.25, d + 0.3], [0, 0.12, 0]));
  g.add(block(floor, [w - 0.4, 0.06, d - 0.4], [0, 0.27, 0]));
  g.add(block(rim, [w - 0.1, 0.05, 0.12], [0, 0.27, d / 2 - 0.12]), block(rim, [w - 0.1, 0.05, 0.12], [0, 0.27, -d / 2 + 0.12]));
  // Back wall with porthole, low side walls: the dollhouse cut-away faces the camera.
  g.add(block(shell, [w + 0.3, WALL_H, 0.35], [0, WALL_H / 2 + 0.2, -d / 2]));
  g.add(block(shell, [0.3, WALL_H * 0.55, d], [-w / 2, WALL_H * 0.275 + 0.2, 0]), block(shell, [0.3, WALL_H * 0.55, d], [w / 2, WALL_H * 0.275 + 0.2, 0]));
  const port = new THREE.Mesh(geo.torus, trim);
  port.scale.setScalar(0.48);
  port.position.set(0, 1.45, -d / 2 + 0.19);
  g.add(port);
  const pane = new THREE.Mesh(geo.circle, glowMat);
  pane.scale.setScalar(0.44);
  pane.position.set(0, 1.45, -d / 2 + 0.18);
  g.add(pane);
  g.add(block(glowMat, [w * 0.6, 0.08, 0.16], [0, WALL_H + 0.15, -d / 2 + 0.3]));
  // Chunky retro rib on the back wall's crown, and a gasket ring when the room is sealed.
  g.add(block(trim, [w + 0.5, 0.22, 0.5], [0, WALL_H + 0.3, -d / 2]));
  if (room.sealed) {
    const gasket = new THREE.MeshStandardMaterial({ color: STATION.gasket, roughness: 0.3, metalness: 0.6 });
    g.add(block(gasket, [0.14, 0.14, d], [-w / 2, WALL_H * 0.55 + 0.25, 0]), block(gasket, [0.14, 0.14, d], [w / 2, WALL_H * 0.55 + 0.25, 0]));
  }
  if (room.shuttered) g.add(block(new THREE.MeshStandardMaterial({ color: "#c9c3d6", metalness: 0.6, roughness: 0.3 }), [1.1, 0.12, 0.1], [0, 1.95, -d / 2 + 0.22]));
  // A soft light per room, tinted by its air.
  const lamp = new THREE.PointLight(new THREE.Color(lightColor).lerp(new THREE.Color(airTint), 0.35), LIGHT_LEVEL[s.light as Light] * 3.2, 7, 1.6);
  lamp.position.set(0, 2.1, 0.2);
  g.add(lamp);
  // Door frame on the corridor side, with the comfort lamp above it.
  g.add(block(trim, [0.2, 1.4, 0.2], [-0.75, 0.9, d / 2]), block(trim, [0.2, 1.4, 0.2], [0.75, 0.9, d / 2]), block(trim, [1.7, 0.2, 0.2], [0, 1.6, d / 2]));
  const anim: Animated = { phase: room.slot * 0.9 };
  if (room.tenantId !== null) {
    const comfort = tenantComfort(state, room.tenantId, now).score;
    const c = comfortColor(comfort);
    anim.lamp = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 });
    // A lived-in room: a bunk in the tenant's colour, a round rug and a reading lamp.
    const plan = state.members[room.tenantId]?.bodyPlan;
    const hue = plan?.hue ?? 280;
    const blanket = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.55, 0.62), roughness: 0.8 });
    const frameMat = new THREE.MeshStandardMaterial({ color: STATION.trim, roughness: 0.5, metalness: 0.3 });
    g.add(block(frameMat, [1.7, 0.35, 1.0], [-w / 2 + 1.15, 0.45, -d / 2 + 0.85]));
    g.add(block(blanket, [1.5, 0.16, 0.85], [-w / 2 + 1.2, 0.7, -d / 2 + 0.85]));
    g.add(block(new THREE.MeshStandardMaterial({ color: "#fff6e8", roughness: 0.9 }), [0.4, 0.14, 0.7], [-w / 2 + 0.55, 0.72, -d / 2 + 0.85]));
    const rug = new THREE.Mesh(geo.circle, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.45, 0.78), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.setScalar(0.85);
    rug.position.set(0.5, 0.31, 0.2);
    g.add(rug);
    g.add(block(frameMat, [0.08, 1.1, 0.08], [w / 2 - 0.55, 0.85, -d / 2 + 0.6]));
    const shade = new THREE.Mesh(geo.sphere, glowMat);
    shade.scale.set(0.22, 0.16, 0.22);
    shade.position.set(w / 2 - 0.55, 1.45, -d / 2 + 0.6);
    g.add(shade);
    // A potted plant by the door: everyone keeps one, even Pip-9 (plastic).
    const pot = new THREE.MeshStandardMaterial({ color: "#c97b5a", roughness: 0.8 });
    const leaf = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((hue + 120) % 360) / 360, 0.5, 0.55), roughness: 0.7 });
    g.add(block(pot, [0.45, 0.4, 0.45], [w / 2 - 0.6, 0.5, d / 2 - 0.7]));
    for (const [dx, dy, dz, r] of [[0, 0.95, 0, 0.32], [0.18, 1.15, 0.08, 0.22], [-0.16, 1.1, -0.1, 0.24]] as const) {
      const ball = new THREE.Mesh(geo.sphere, leaf);
      ball.scale.setScalar(r);
      ball.position.set(w / 2 - 0.6 + dx, dy, d / 2 - 0.7 + dz);
      g.add(ball);
    }
    const bulb = new THREE.Mesh(geo.sphere, anim.lamp);
    bulb.scale.setScalar(0.24);
    bulb.position.set(0, 1.85, d / 2);
    g.add(bulb);
  }
  if (eff.leakIn.length > 0) {
    const leaked = eff.leakIn[0]!;
    const hazeMat = new THREE.MeshBasicMaterial({ color: AIR_COLOR[leaked], transparent: true, opacity: 0.18, depthWrite: false });
    const haze = new THREE.Mesh(geo.sphere, hazeMat);
    haze.scale.set(w * 0.42, 0.7, d * 0.42);
    haze.position.set(0, 0.9, 0);
    g.add(haze);
    anim.haze = haze;
  }
  if (s.gravity === "low") {
    anim.motes = [];
    const moteMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#d9ccff", emissiveIntensity: 0.8 });
    for (let i = 0; i < 6; i++) {
      const mote = new THREE.Mesh(geo.sphere, moteMat);
      mote.scale.setScalar(0.07);
      mote.position.set(Math.sin(i * 2.3) * w * 0.3, 1, Math.cos(i * 1.7) * d * 0.3);
      anim.motes.push(mote);
      g.add(mote);
    }
  } else if (s.gravity === "heavy") {
    const plate = new THREE.MeshStandardMaterial({ color: "#3b3550", metalness: 0.7, roughness: 0.3 });
    for (const x of [-1, 1]) g.add(block(plate, [0.5, 0.05, d - 0.8], [x * (w / 2 - 0.6), 0.31, 0]));
  }
  anims.push(anim);
  return g;
}

function buildScaffold(slot: number): THREE.Group {
  const pose = BERTHS[slot]!;
  const g = new THREE.Group();
  g.position.set(pose.x, 0, pose.z);
  const mat = new THREE.MeshStandardMaterial({ color: STATION.scaffold, emissive: STATION.scaffold, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 });
  const { w, d } = BERTH_SIZE;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(block(mat, [0.12, 1.2, 0.12], [x * w / 2, 0.6, z * d / 2]));
  g.add(block(mat, [w, 0.06, 0.06], [0, 0.05, d / 2]), block(mat, [w, 0.06, 0.06], [0, 0.05, -d / 2]), block(mat, [0.06, 0.06, d], [w / 2, 0.05, 0]), block(mat, [0.06, 0.06, d], [-w / 2, 0.05, 0]));
  return g;
}

function buildCorridor(): THREE.Group {
  const g = new THREE.Group();
  const deck = new THREE.MeshStandardMaterial({ color: STATION.corridor, roughness: 0.6, metalness: 0.3 });
  const stripe = new THREE.MeshStandardMaterial({ color: "#ffd98a", emissive: "#ffb347", emissiveIntensity: 0.6 });
  const xs = BERTHS.map((b) => b.x);
  const minX = Math.min(...xs) - BERTH_SIZE.w / 2;
  const maxX = Math.max(...xs) + BERTH_SIZE.w / 2;
  const frontZ = Math.max(...BERTHS.map((b) => b.z)) + BERTH_SIZE.d / 2;
  const hallZ = (AIRLOCK.z + frontZ) / 2;
  g.add(block(deck, [maxX - minX, 0.12, Math.max(0.6, AIRLOCK.z - frontZ)], [(minX + maxX) / 2, 0.06, hallZ]));
  g.add(block(stripe, [maxX - minX, 0.02, 0.08], [(minX + maxX) / 2, 0.13, hallZ]));
  return g;
}

/** "NO VACANCY" in neon on a canvas: NO lights only when every berth is let. */
function buildSign(): { group: THREE.Group; paint: (full: boolean, t: number) => void } {
  const group = new THREE.Group();
  // Up on a mast behind the back row, so it reads over the roofs instead of hiding a room.
  const backZ = Math.min(...BERTHS.map((b) => b.z)) - BERTH_SIZE.d / 2 - 0.6;
  group.position.set(AIRLOCK.x, 4.6, backZ);
  if (typeof document === "undefined") return { group, paint() {} };
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
  group.add(board);
  const frame = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({ color: "#1b1530", metalness: 0.5, roughness: 0.4 }));
  frame.scale.set(4.4, 1.2, 0.12);
  frame.position.z = -0.08;
  group.add(frame);
  const mast = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({ color: "#4a4566", metalness: 0.6, roughness: 0.4 }));
  mast.scale.set(0.25, 4.6, 0.25);
  mast.position.set(0, -2.6, -0.2);
  group.add(mast);
  const g2d = canvas.getContext("2d");
  let last = "";
  return {
    group,
    paint(full, t) {
      if (g2d === null) return;
      const flicker = full ? (Math.sin(t * 13) > 0.92 ? 0.35 : 1) : 0;
      const key = `${full}:${flicker}`;
      if (key === last) return;
      last = key;
      g2d.clearRect(0, 0, 512, 128);
      g2d.font = "bold 76px Comfortaa, Trebuchet MS, sans-serif";
      g2d.textBaseline = "middle";
      const draw = (text: string, x: number, color: string, on: number) => {
        g2d.shadowColor = color;
        g2d.shadowBlur = on > 0 ? 24 : 0;
        g2d.fillStyle = on > 0 ? color : "#3a2f4f";
        g2d.globalAlpha = on > 0 ? on : 0.9;
        g2d.fillText(text, x, 66);
      };
      draw("NO", 22, "#ff5fa8", flicker);
      draw("VACANCY", 150, "#6ff3ff", 1);
      g2d.globalAlpha = 1;
      texture.needsUpdate = true;
    },
  };
}

function signature(state: HouseholdState, now: number): string {
  const b = boardingOf(state);
  const rooms = b.rooms.map((r) => {
    const comfort = r.tenantId === null ? -1 : Math.floor(tenantComfort(state, r.tenantId, now).score / 5);
    return `${r.slot}:${r.settings.atmosphere}${r.settings.gravity}${r.settings.climate}${r.settings.light}:${r.sealed ? 1 : 0}${r.shuttered ? 1 : 0}:${r.tenantId ?? "-"}:${comfort}`;
  });
  return `${rooms.join("|")}#${b.flareUntil > now ? "F" : ""}#${Object.keys(b.noisyUntil).length}#${b.applicant?.species ?? ""}`;
}

export function roomModulesDraw(ctx: GameContext | null): EngineDraw {
  const root = new THREE.Group();
  const modules = new THREE.Group();
  root.add(modules, buildCorridor());
  const sign = buildSign();
  root.add(sign.group);
  let anims: Animated[] = [];
  let last = "";
  let warned = false;
  // Whoever is buzzing at the airlock waits in the corridor in person, under a little spotlight.
  const visitor = new THREE.Group();
  visitor.position.set(AIRLOCK.x + 1.9, 0, AIRLOCK.z + 1.5);
  root.add(visitor);
  let visitorAnimate: ((t: number, moving: boolean) => void) | null = null;
  const clear = () => {
    modules.traverse((node) => { const m = (node as THREE.Mesh).material as THREE.Material | undefined; m?.dispose(); });
    modules.clear();
    anims = [];
  };
  return {
    mount(state: EngineFrameState) { state.scene.add(root); },
    frame(state: EngineFrameState) {
      if (ctx === null) { if (!warned) { warned = true; console.warn("[no-vacancy] room modules have no game context"); } return; }
      try { drawFrame(state, ctx); } catch (error) { if (!warned) { warned = true; console.warn("[no-vacancy] room modules failed", error); } }
    },
    dispose(state: EngineFrameState) {
      clear();
      state.scene.remove(root);
    },
  };
  function drawFrame(state: EngineFrameState, ctx: GameContext): void {
    {
      // The station deck is flattened around the house; stand the modules on it, not at sea level.
      root.position.y = ctx.world.groundHeightAt(AIRLOCK.x, AIRLOCK.z);
      const household = householdStore.read(ctx);
      const now = ctx.time.now();
      const sig = signature(household, now);
      if (sig !== last) {
        last = sig;
        clear();
        for (let slot = 0; slot < ROOM_SLOTS; slot++) {
          const room = roomBySlot(household, slot);
          modules.add(room === null ? buildScaffold(slot) : buildRoom(household, room, now, anims));
        }
        visitor.clear();
        visitorAnimate = null;
        const applicant = boardingOf(household).applicant;
        if (applicant !== null) {
          const rig = buildTenantRig(SPECIES[applicant.species].bodyPlan);
          rig.root.scale.setScalar(0.9);
          visitor.add(rig.root);
          const spot = new THREE.Mesh(geo.circle, new THREE.MeshBasicMaterial({ color: "#6ff3ff", transparent: true, opacity: 0.35, depthWrite: false }));
          spot.rotation.x = -Math.PI / 2;
          spot.position.y = 0.14;
          spot.scale.setScalar(0.8);
          visitor.add(spot);
          visitorAnimate = rig.animate;
        }
      }
      const t = state.clock.elapsedTime;
      visitorAnimate?.(t, false);
      for (const a of anims) {
        if (a.lamp) a.lamp.emissiveIntensity = 1.2 + Math.sin(t * 2 + a.phase) * 0.4;
        if (a.haze) { (a.haze.material as THREE.MeshBasicMaterial).opacity = 0.12 + (Math.sin(t * 1.3 + a.phase) + 1) * 0.06; a.haze.rotation.y = t * 0.2; }
        a.motes?.forEach((m, i) => { m.position.y = 0.8 + Math.sin(t * 0.7 + i + a.phase) * 0.5; });
      }
      sign.paint(household.order.length > 0 && noVacancy(household), t);
      state.invalidate();
    }
  }
}

/** The overlay is handed the live context; the hook is only a fallback outside the world scene. */
export function RoomModules({ ctx: given }: { ctx?: GameContext }) {
  const hooked = useGameContext();
  const ctx = given ?? hooked;
  return <EngineDrawMount create={() => roomModulesDraw(ctx)} deps={[ctx]} />;
}
