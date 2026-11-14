/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
} from "three";
import { useGameContext } from "@jgengine/ui/provider";
import { useGameStore } from "@jgengine/ui/hooks";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { StaticShapeInstances } from "@jgengine/core/instancing/staticShapeInstances.draw";


import { buildCost, keep, towerLevel, towerStats } from "../keep";
import { session } from "../session";
import { towerDef } from "../entities/towers/catalog";
import { editorLayers } from "../../editorLayers";
import { WORKER_HEIGHT } from "../models";
import { townProjection } from "../ui/SpeechBubbles";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { useEffect } from "@jgengine/core/ui/jsx";
import { activeProjectiles, type PendingProjectile } from "../combat/pendingProjectiles";
import { BUILD_PLOTS, FLANK_POINT_KEY, HAS_FLANK, ROUTES, SPAWN_POINT, groundHeightAt } from "./path";

import { plotShapes } from "./plotShapes";
import { rangeRingBand } from "./rangeRing";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

function BuildPlots() {
  const gold = useGameStore((c) => keep.of(c).num("keep.gold"));
  const occupied = useGameStore((c) => BUILD_PLOTS.map((plot) => keep.of(c).occupant(plot.id) !== null).join(","));
  const selectedId = session.selectedTowerId;
  const cost = selectedId === null ? 0 : buildCost(selectedId);
  const affordable = selectedId !== null && gold >= cost;
  // Concrete pads on the sidewalk - an empty plot reads as a spot waiting for a worker - with a halo
  // coloured by whether the picked worker is affordable.
  const color = selectedId === null ? "#8a8a80" : affordable ? "#5fdf6a" : "#df4a4a";
  const shapes = useMemo(() => plotShapes(BUILD_PLOTS, occupied.split(",").map((flag) => flag !== "true"), color), [occupied, color]);
  return <StaticShapeInstances instances={shapes} />;
}

/** A worker still clocking in: an orange traffic-cone frame that climbs with the hire, so a timed hire reads on the street. */
function buildSitesDraw(sites: readonly string[]): EngineDraw {
  const group = new Group();
  const unitBox = new BoxGeometry(1, 1, 1);
  const timber = new MeshStandardMaterial({ color: "#ff8a2a", roughness: 0.7 });
  const capMaterial = new MeshStandardMaterial({ color: "#f4f0e8", roughness: 0.8 });
  const posts: { plot: (typeof BUILD_PLOTS)[number]; height: number }[] = [];
  for (const site of sites) {
    const [slot, progressText] = site.split(":");
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === slot);
    if (plot === undefined) continue;
    posts.push({ plot, height: 0.3 + 2.6 * Number(progressText) });
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const { plot, height } of posts) {
        const site = new Group();
        site.position.set(plot.position[0], plot.position[1], plot.position[2]);
        for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) {
          const post = new Mesh(unitBox, timber);
          post.scale.set(0.18, height, 0.18);
          post.position.set(dx, height / 2, dz);
          post.castShadow = true;
          site.add(post);
        }
        const cap = new Mesh(unitBox, capMaterial);
        cap.scale.set(2.1, 0.14, 2.1);
        cap.position.y = height;
        cap.castShadow = true;
        site.add(cap);
        group.add(site);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      unitBox.dispose();
      timber.dispose();
      capMaterial.dispose();
    },
  };
}

function BuildSites() {
  const sites = useGameStore((c) => {
    const world = keep.of(c);
    return world.orders("build").map((order) => `${world.instance(order.target ?? "")?.slot ?? ""}:${order.progress.toFixed(2)}`).join(",");
  });
  if (sites.length === 0) return null;
  return <EngineDrawMount create={() => buildSitesDraw(sites.split(","))} deps={[sites]} />;
}

/** The inspected worker's reach: a draped ground outline, so the street stays readable under it. */
function rangeRingDraw(center: readonly [number, number], radius: number): EngineDraw {
  const [x, z] = center;
  const geometry = new BufferGeometry();
  const band = rangeRingBand({ center: [x, z], radius, sampleHeight: groundHeightAt });
  geometry.setAttribute("position", new BufferAttribute(band.positions, 3));
  geometry.setIndex(new BufferAttribute(band.indices, 1));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: "#f4d35e",
    emissive: "#f4d35e",
    emissiveIntensity: 0.6,
    roughness: 0.5,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 4;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

function RangeRing({ center, radius }: { center: readonly [number, number]; radius: number }) {
  return <EngineDrawMount create={() => rangeRingDraw(center, radius)} deps={[center[0], center[1], radius]} />;
}

/** The selection ring's flat gold band under the inspected tower. */
function inspectionRingDraw(): EngineDraw {
  const geometry = new RingGeometry(1.5, 1.75, 32);
  const material = new MeshStandardMaterial({ color: "#f4d35e", emissive: "#f4d35e", emissiveIntensity: 0.8, roughness: 0.5 });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.33;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Selection ring plus the live reach of the worker whose card is open. */
function InspectedTower() {
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const slot = useGameStore((c) => (inspectedId === null ? null : keep.of(c).instance(inspectedId)?.slot ?? null));
  const range = useGameStore((c) => (inspectedId === null ? 0 : towerStats(keep.of(c), inspectedId).range));
  const plot = slot === null ? undefined : BUILD_PLOTS.find((candidate) => candidate.id === slot);
  if (plot === undefined) return null;
  return (
    <>
      <SceneObjectGroup position={[plot.position[0], plot.position[1], plot.position[2]]}>
        <EngineDrawMount create={inspectionRingDraw} deps={[]} />
      </SceneObjectGroup>
      <RangeRing center={[plot.position[0], plot.position[2]]} radius={range} />
    </>
  );
}

/**
 * Where the tech comes from: a 5G cell tower at each road's mouth, a tapering lattice with panel
 * antennas and a blinking red beacon on top, so the source of the march reads from the camera.
 */
function spawnGateDraw(at: readonly [number, number, number], facing: number): EngineDraw {
  const [x, y, z] = at;
  const group = new Group();
  group.position.set(x - 3.2, y, z - 3.2);
  group.rotation.y = facing;
  const unitBox = new BoxGeometry(1, 1, 1);
  const unitSphere = new SphereGeometry(1, 10, 8);
  const unitPlane = new PlaneGeometry(1, 1);
  const steel = new MeshStandardMaterial({ color: "#9aa4b0", roughness: 0.5, metalness: 0.4 });
  const panel = new MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.6 });
  const sign = new MeshStandardMaterial({ color: "#1c1c24", emissive: "#3ab0ff", emissiveIntensity: 0.6, roughness: 0.4, side: DoubleSide });
  const beacon = new MeshStandardMaterial({ color: "#ff2a2a", emissive: "#ff2a2a", emissiveIntensity: 1.6, roughness: 0.3 });
  let light: Mesh | null = null;
  let clock = 0;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const height = 11;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const leg = new Mesh(unitBox, steel);
        leg.scale.set(0.16, height, 0.16);
        leg.position.set(dx * 0.75, height / 2, dz * 0.75);
        leg.rotation.set(dz * 0.06, 0, -dx * 0.06);
        leg.castShadow = true;
        group.add(leg);
      }
      for (let level = 1; level < 6; level += 1) {
        const width = 1.6 - level * 0.18;
        const brace = new Mesh(unitBox, steel);
        brace.scale.set(width, 0.08, width);
        brace.position.y = level * 2;
        group.add(brace);
      }
      for (let side = 0; side < 3; side += 1) {
        const antenna = new Mesh(unitBox, panel);
        const angle = (side * Math.PI * 2) / 3;
        antenna.scale.set(0.35, 1.4, 0.12);
        antenna.position.set(Math.sin(angle) * 0.55, height - 1, Math.cos(angle) * 0.55);
        antenna.rotation.y = angle;
        antenna.castShadow = true;
        group.add(antenna);
      }
      light = new Mesh(unitSphere, beacon);
      light.scale.setScalar(0.3);
      light.position.y = height + 0.4;
      group.add(light);
      const board = new Mesh(unitPlane, sign);
      board.scale.set(2.6, 1.3, 1);
      board.position.set(0, 3.2, 0.95);
      group.add(board);
    },
    frame(_state: EngineFrameState, dt: number) {
      clock += dt;
      if (light !== null) light.visible = clock % 1.2 < 0.6;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      unitBox.dispose();
      unitSphere.dispose();
      unitPlane.dispose();
      steel.dispose();
      panel.dispose();
      sign.dispose();
      beacon.dispose();
    },
  };
}

function SpawnGate({ at, facing = 0 }: { at: readonly [number, number, number]; facing?: number }) {
  return <EngineDrawMount create={() => spawnGateDraw(at, facing)} deps={[at[0], at[1], at[2], facing]} />;
}

function boltPosition(bolt: PendingProjectile, now: number): [number, number, number] {
  const t = Math.min(1, (now - bolt.spawnedAt) / bolt.travelSeconds);
  return [
    bolt.from[0] + (bolt.to[0] - bolt.from[0]) * t,
    bolt.from[1] + 0.9 + (bolt.to[1] - bolt.from[1]) * t,
    bolt.from[2] + (bolt.to[2] - bolt.from[2]) * t,
  ];
}

/** Bolts in flight: one draw owns a mesh per live bolt and moves them every frame without a render. */
function projectileBoltsDraw(ctx: GameContext): EngineDraw {
  const group = new Group();
  const geometry = new SphereGeometry(0.14, 8, 8);
  const materials = new Map<string, MeshStandardMaterial>();
  const bolts = new Map<string, Mesh>();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const now = ctx.time.now();
      const seen = new Set<string>();
      for (const bolt of activeProjectiles(now)) {
        seen.add(bolt.id);
        let mesh = bolts.get(bolt.id);
        if (mesh === undefined) {
          let material = materials.get(bolt.color);
          if (material === undefined) {
            material = new MeshStandardMaterial({ color: bolt.color, emissive: bolt.color, emissiveIntensity: 0.9 });
            materials.set(bolt.color, material);
          }
          mesh = new Mesh(geometry, material);
          group.add(mesh);
          bolts.set(bolt.id, mesh);
        }
        const [bx, by, bz] = boltPosition(bolt, now);
        mesh.position.set(bx, by, bz);
      }
      for (const [id, mesh] of bolts) {
        if (seen.has(id)) continue;
        group.remove(mesh);
        bolts.delete(id);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      bolts.clear();
      geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

/** Bolts in flight: the draw reads the live list each frame, so firing and landing never re-render. */
function ProjectileBolts() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => projectileBoltsDraw(ctx)} deps={[ctx]} />;
}

/**
 * What the workers are going through, drawn every frame from the session without a render: a glowing
 * phone over everyone Distracted (looking down, not working), a red ring under the Spotted, a coloured
 * work mat under every worker, the hush and offline circles around Librarians and Monks, and the
 * cardboard parcels drones leave on plots.
 */
function workerStatusDraw(ctx: GameContext): EngineDraw {
  const group = new Group();
  const phoneBody = new BoxGeometry(0.5, 0.85, 0.08);
  const phoneScreen = new PlaneGeometry(0.42, 0.72);
  const ring = new RingGeometry(1.15, 1.4, 32);
  const mat = new CylinderGeometry(1.3, 1.3, 0.06, 28);
  const aura = new RingGeometry(0.97, 1, 64);
  const parcelBox = new BoxGeometry(1.1, 0.9, 1.1);
  const tape = new BoxGeometry(1.12, 0.12, 0.3);
  const dark = new MeshStandardMaterial({ color: "#1c1c24", roughness: 0.4 });
  const glow = new MeshStandardMaterial({ color: "#5ab8ff", emissive: "#5ab8ff", emissiveIntensity: 1.4, side: DoubleSide });
  const spotted = new MeshStandardMaterial({ color: "#ff3a3a", emissive: "#ff3a3a", emissiveIntensity: 1, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });
  const cardboard = new MeshStandardMaterial({ color: "#c08a4a", roughness: 0.95 });
  const tapeMaterial = new MeshStandardMaterial({ color: "#e8d27a", roughness: 0.6 });
  const mats = new Map<string, MeshStandardMaterial>();
  const auras = new Map<string, MeshStandardMaterial>();
  const star = new SphereGeometry(0.22, 10, 8);
  const gold = new MeshStandardMaterial({ color: "#ffd24a", emissive: "#ffb020", emissiveIntensity: 0.8, roughness: 0.4 });
  const pool = { phones: [] as Group[], rings: [] as Mesh[], mats: [] as Mesh[], auras: [] as Mesh[], parcels: [] as Group[], stars: [] as Mesh[] };
  const matOf = (color: string) => {
    let value = mats.get(color);
    if (value === undefined) {
      value = new MeshStandardMaterial({ color, roughness: 0.8 });
      mats.set(color, value);
    }
    return value;
  };
  const auraOf = (color: string) => {
    let value = auras.get(color);
    if (value === undefined) {
      value = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false });
      auras.set(color, value);
    }
    return value;
  };
  const take = <T extends Group | Mesh>(list: T[], index: number, make: () => T): T => {
    let item = list[index];
    if (item === undefined) {
      item = make();
      list.push(item);
      group.add(item);
    }
    item.visible = true;
    return item;
  };
  let clock = 0;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(_state: EngineFrameState, dt: number) {
      clock += dt;
      const used = { phones: 0, rings: 0, mats: 0, auras: 0, parcels: 0, stars: 0 };
      const world = keep.of(ctx);
      for (const worker of world.instances()) {
        if (!worker.ready) continue;
        const at = ctx.scene.entity.get(worker.id)?.position;
        if (at === undefined) continue;
        const def = towerDef(worker.kind, editorLayers);
        // Promotions show as gold pips orbiting slowly over the worker's head, one per rank above the first.
        const ranks = towerLevel(world, worker.id) - 1;
        for (let index = 0; index < ranks; index += 1) {
          const pip = take(pool.stars, used.stars++, () => new Mesh(star, gold));
          const angle = clock * 1.2 + (index * Math.PI * 2) / Math.max(1, ranks);
          pip.position.set(at[0] + Math.cos(angle) * 0.55, at[1] + WORKER_HEIGHT + 0.25, at[2] + Math.sin(angle) * 0.55);
        }
        const pad = take(pool.mats, used.mats++, () => new Mesh(mat, matOf(def.color)));
        pad.material = matOf(def.color);
        pad.position.set(at[0], at[1] + 0.05, at[2]);
        if (def.job === "librarian" || def.job === "monk") {
          const radius = towerStats(world, worker.id).range;
          const circle = take(pool.auras, used.auras++, () => new Mesh(aura, auraOf("#b68cff")));
          circle.material = auraOf(def.job === "librarian" ? "#b68cff" : "#ffb060");
          circle.rotation.x = -Math.PI / 2;
          circle.scale.setScalar(radius);
          circle.position.set(at[0], groundHeightAt(at[0], at[2]) + 0.12, at[2]);
        }
        if (session.workers.has(worker.id, "spotted")) {
          const red = take(pool.rings, used.rings++, () => new Mesh(ring, spotted));
          red.rotation.x = -Math.PI / 2;
          red.position.set(at[0], at[1] + 0.12, at[2]);
        }
        if (session.workers.has(worker.id, "distracted")) {
          const phone = take(pool.phones, used.phones++, () => {
            const holder = new Group();
            const body = new Mesh(phoneBody, dark);
            const screen = new Mesh(phoneScreen, glow);
            screen.position.z = 0.045;
            holder.add(body, screen);
            return holder;
          });
          phone.position.set(at[0], at[1] + WORKER_HEIGHT + 0.7 + Math.sin(clock * 5) * 0.08, at[2]);
          phone.rotation.set(-0.5, clock * 1.5, 0.15 * Math.sin(clock * 3));
        }
      }
      for (const plotId of session.parcels) {
        const plot = BUILD_PLOTS.find((candidate) => candidate.id === plotId);
        if (plot === undefined) continue;
        const parcel = take(pool.parcels, used.parcels++, () => {
          const holder = new Group();
          const boxMesh = new Mesh(parcelBox, cardboard);
          boxMesh.position.y = 0.45;
          boxMesh.castShadow = true;
          const strip = new Mesh(tape, tapeMaterial);
          strip.position.y = 0.91;
          holder.add(boxMesh, strip);
          return holder;
        });
        parcel.position.set(plot.position[0], plot.position[1] + 0.2, plot.position[2]);
        parcel.rotation.y = 0.4;
      }
      for (const [key, list] of Object.entries(pool) as [keyof typeof used, (Group | Mesh)[]][]) {
        for (let index = used[key]; index < list.length; index += 1) list[index]!.visible = false;
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const geometry of [phoneBody, phoneScreen, ring, mat, aura, parcelBox, tape, star]) geometry.dispose();
      for (const material of [dark, glow, spotted, cardboard, tapeMaterial, gold, ...mats.values(), ...auras.values()]) material.dispose();
    },
  };
}

/** Hands the live camera projection to the HUD, whose speech bubbles anchor to workers and tech. */
function ShareProjection() {
  const project = useWorldProjection();
  useEffect(() => {
    townProjection.current = (position) => {
      const point = project(position);
      return point === null ? { x: 0, y: 0, behind: true } : { x: point.x, y: point.y, behind: point.behind === true };
    };
    return () => { townProjection.current = null; };
  }, [project]);
  return null;
}

function WorkerStatus() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => workerStatusDraw(ctx)} deps={[ctx]} />;
}

/** VFX-only overlay — the authored scene (draped streets + instanced yard scatter) is auto-mounted
 * by `defineGame({ editorLayers })`. */
export function BeaconBastionWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding />
      <SpawnGate at={SPAWN_POINT} />
      {HAS_FLANK ? <SpawnGate at={ROUTES[FLANK_POINT_KEY]![0]!} facing={Math.PI / 2} /> : null}
      <BuildPlots />
      <BuildSites />
      <InspectedTower />
      <WorkerStatus />
      <ShareProjection />
      <ProjectileBolts />
    </>
  );
}

