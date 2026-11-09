import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { pathFollowSeek } from "@jgengine/core/nav/pathFollow";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Plane, PlaneGeometry, Raycaster, RingGeometry, TextureLoader, Vector2, Vector3 } from "three";
import type { Texture } from "three";
import motionJson from "../../../public/art/models/motion.json";
import { objectModels } from "../models";
import { session } from "../session";
import { cellCentres, cellFor, park, parkObject, parkObjects, patrolRadius, type ParkObject } from "../park";
import { BUILDABLES } from "../objects/catalog";
import { coasterCircuit, rideView } from "../rides";
import { placementAt } from "../build/placement";
import { GRID, snapToTile } from "../catalog";
import { traceNative } from "../evidence";
import { hoverRefusal, placementHintStore } from "../build/placementHint";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { tileAt, cellCentre, groundAt, isLandTool, LEVEL_HEIGHT, lineCells, raisedCells, rectCells } from "../build/terrain";
import { landCheck, LINE_KINDS } from "../build/commands";
import { StallWares } from "./StallWares";
import { AuthoredScenery } from "./AuthoredScenery";
import { currentHint } from "../onboarding";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

/** Each moving ride part: its own GLB whose origin is the pivot, and how it moves (spin, wheel, swing, drop). */
type MotionSpec = { model: string; kind: "spin" | "wheel" | "swing" | "drop"; pivot: [number, number, number]; speed: number; amplitude?: number; level?: string };
const MOTION = motionJson as unknown as Record<string, MotionSpec>;
const motionUrl = (model: string) => new URL(`../../../public/art/models/${model}.glb`, import.meta.url).href;

/** Clone a loaded GLB scene with shadows on every mesh — the shared per-instance prep both ride draws need. */
function shadowedClone(gltf: { scene: Group }): Group {
  const copy = gltf.scene.clone();
  copy.traverse(n => { if (n instanceof Mesh) { n.castShadow = true; n.receiveShadow = true; } });
  return copy;
}

/**
 * A ride part's animated body as a draw: loads its GLB once (the shared loader caches the parse),
 * then spins, wheels, swings or drops on the frame clock. `live` reads the ride's current phase so
 * a broken or idle ride stands still.
 */
function rideMotionDraw(spec: MotionSpec, objectId: string, live: () => { moving: boolean; now: number }): EngineDraw {
  const pivot = new Group();
  const anim = new Group();
  pivot.add(anim);
  const levels: Object3D[] = [];
  const amplitude = spec.amplitude ?? 1;
  let mounted = false;
  let cancelled = false;
  const loader = new GLTFLoader();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(pivot);
      mounted = true;
      void loader.loadAsync(motionUrl(spec.model)).then(gltf => {
        if (cancelled || !mounted) return;
        const copy = shadowedClone(gltf);
        if (spec.level !== undefined) copy.traverse(n => { if (n.name.startsWith(spec.level as string)) levels.push(n); });
        anim.add(copy);
      });
    },
    frame() {
      const { moving, now } = live();
      const t = moving ? now : 0;
      if (spec.kind === "spin") anim.rotation.y = t * spec.speed;
      if (spec.kind === "wheel") { anim.rotation.x = t * spec.speed; for (const cabin of levels) cabin.rotation.x = -anim.rotation.x; }
      if (spec.kind === "swing") anim.rotation.x = Math.sin(t * spec.speed * Math.PI * 2) * amplitude;
      if (spec.kind === "drop") { const phase = (t * spec.speed) % 1; anim.position.y = (phase < .8 ? phase / .8 : Math.pow((1 - phase) / .2, 3)) * amplitude; }
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      state.scene.remove(pivot);
      pivot.clear();
    },
  };
}

function RideMotion({ object }: { object: ParkObject }) {
  const spec = MOTION[object.kind]!;
  const clock = useGameStore(ctx => ctx.time);
  const reduced = useGameStore(ctx => Boolean(ctx.game.store.get("park.reduced-motion")));
  const ctx = useGameContext();
  const live = useMemo(() => () => {
    const view = rideView(object.id);
    // A broken or idle ride stands still; one running its cycle moves.
    const moving = !reduced && view !== null && view.phase !== "broken" && view.phase !== "idle";
    return { moving, now: moving ? clock.now() : 0 };
  }, [object.id, reduced, clock]);
  const yaw = (park.of(ctx).num(`${object.id}.rot`) * Math.PI) / 2;
  return <SceneObjectGroup position={[object.x, groundAt(park.of(ctx), object.x, object.z), object.z]} rotationY={yaw} userData={{ jgObjectId: object.id }}>
    <SceneObjectGroup position={spec.pivot}>
      <EngineDrawMount create={() => rideMotionDraw(spec, object.id, live)} deps={[spec, object.id, live]} />
    </SceneObjectGroup>
  </SceneObjectGroup>;
}
const trainModel = new URL("../../../public/art/models/coaster_train.glb", import.meta.url).href;

/**
 * The train is the ride made visible. The shared path follower places it at the lap fraction the
 * ride sim's own cycle reports, so it leaves the station, runs the ring and is back at the platform
 * when the lap the track measured is over.
 */
function coasterTrainDraw(objectId: string, path: Parameters<typeof pathFollowSeek>[0], lapSeconds: () => number, live: () => { riding: boolean; phaseSeconds: number; reduced: boolean }): EngineDraw {
  const root = new Group();
  let mounted = false;
  let cancelled = false;
  const loader = new GLTFLoader();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
      mounted = true;
      void loader.loadAsync(trainModel).then(gltf => {
        if (cancelled || !mounted) return;
        root.add(shadowedClone(gltf));
      });
    },
    frame() {
      const { riding, phaseSeconds, reduced } = live();
      if (path.waypoints.length < 3) { root.visible = false; return; }
      root.visible = true;
      const lap = Math.max(4, lapSeconds());
      const progress = riding && !reduced ? Math.min(1, Math.max(0, 1 - phaseSeconds / lap)) : 0;
      const pose = pathFollowSeek(path, { kind: "normalized", value: progress });
      root.position.set(pose.position[0], pose.position[1] + 1.2, pose.position[2]);
      root.rotation.y = pose.heading;
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      state.scene.remove(root);
      root.clear();
    },
  };
}

function CoasterTrain({ object, circuit }: { object: ParkObject; circuit: ReturnType<typeof coasterCircuit> }) {
  const reduced = useGameStore(ctx => Boolean(ctx.game.store.get("park.reduced-motion")));
  const path = useMemo(() => ({ waypoints: circuit.waypoints, speed: Math.max(1, circuit.averageSpeed), loop: true }), [circuit]);
  const live = useMemo(() => () => {
    const view = rideView(object.id);
    return { riding: view?.phase === "riding", phaseSeconds: view?.phaseSeconds ?? 0, reduced };
  }, [object.id, reduced]);
  const closed = circuit.closed;
  return <SceneObjectGroup userData={{ jgObjectId: object.id }}>
    <EngineDrawMount create={() => coasterTrainDraw(object.id, path, () => Math.max(4, circuit.lapSeconds), live)} deps={[object.id, path, circuit.lapSeconds, live, closed]} />
  </SceneObjectGroup>;
}
const GATE_URL = new URL("../../../public/art/models/deco_gate.glb", import.meta.url).href;
const SIGN_URL = new URL("../../../public/art/brightway-sign.svg", import.meta.url).href;

/** The entrance gate model and its backlit sign, loaded together as one draw. */
function entranceDraw(): EngineDraw {
  const group = new Group();
  let mounted = false;
  let cancelled = false;
  const textures: Texture[] = [];
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      mounted = true;
      const loader = new GLTFLoader();
      const textureLoader = new TextureLoader();
      void Promise.all([loader.loadAsync(GATE_URL), textureLoader.loadAsync(SIGN_URL)]).then(([gate, sign]) => {
        if (cancelled || !mounted) return;
        textures.push(sign);
        const model = gate.scene.clone(true);
        model.traverse(node => { node.castShadow = true; node.receiveShadow = true; });
        const material = new MeshBasicMaterial({ map: sign, transparent: true });
        for (const z of [0.3, -0.3]) {
          const mesh = new Mesh(new PlaneGeometry(9, 2.8), material);
          mesh.position.set(0, 4.4, z);
          if (z < 0) mesh.rotation.y = Math.PI;
          group.add(mesh);
        }
        group.add(model);
      });
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      state.scene.remove(group);
      group.traverse(n => { if (n instanceof Mesh) n.geometry.dispose(); });
      group.clear();
      for (const texture of textures) texture.dispose();
    },
  };
}
function Entrance() {
  return <SceneObjectGroup position={[0, 0, 56]}>
    <EngineDrawMount create={entranceDraw} deps={[]} />
  </SceneObjectGroup>;
}

/** The perimeter fence: every post and rail as one static draw, sharing geometry and materials. */
function fenceDraw(): EngineDraw {
  const group = new Group();
  const postGeometry = new BoxGeometry(0.23, 1.6, 0.23);
  const railGeometry = new BoxGeometry(0.12, 0.1, 120);
  const sideGeometry = new BoxGeometry(120, 0.1, 0.12);
  const halfGeometry = new BoxGeometry(50, 0.1, 0.12);
  const postMaterial = new MeshStandardMaterial({ color: "#fff1cf" });
  const railMaterial = new MeshStandardMaterial({ color: "#ad7960" });
  const points: [number, number][] = [];
  for (let i = -60; i <= 60; i += 8) { points.push([-60, i], [60, i], [i, -60]); if (Math.abs(i) > 8) points.push([i, 60]); }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const [x, z] of points) {
        const post = new Mesh(postGeometry, postMaterial);
        post.position.set(x, 0.8, z);
        post.castShadow = true;
        group.add(post);
      }
      for (const y of [0.6, 1.2]) {
        for (const x of [-60, 60]) {
          const rail = new Mesh(railGeometry, railMaterial);
          rail.position.set(x, y, 0);
          group.add(rail);
        }
        const north = new Mesh(sideGeometry, railMaterial);
        north.position.set(0, y, -60);
        group.add(north);
        for (const x of [-35, 35]) {
          const rail = new Mesh(halfGeometry, railMaterial);
          rail.position.set(x, y, 60);
          group.add(rail);
        }
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      postGeometry.dispose();
      railGeometry.dispose();
      sideGeometry.dispose();
      halfGeometry.dispose();
      postMaterial.dispose();
      railMaterial.dispose();
    },
  };
}
function Fence() {
  return <>
    <EngineDrawMount create={fenceDraw} deps={[]} />
    <Entrance />
  </>;
}

/**
 * The blueprint's own model at the cursor, see-through and tinted: green where it can go, red where
 * it can't (the hint bar says why). It faces the way Z has turned the next build.
 */
function ghostDraw(kind: string, at: [number, number], y: number, valid: boolean, rotation: number): EngineDraw {
  const config = objectModels[kind]!;
  const material = new MeshStandardMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
  material.color.set(valid ? "#7cf3c8" : "#ef7059");
  const group = new Group();
  group.position.set(at[0], y, at[1]);
  group.rotation.y = rotation * Math.PI / 2;
  let mounted = false;
  let cancelled = false;
  const loader = new GLTFLoader();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      mounted = true;
      void loader.loadAsync(config.url).then(gltf => {
        if (cancelled || !mounted) return;
        const copy = gltf.scene.clone();
        copy.traverse(n => { if (n instanceof Mesh) { n.material = material; n.raycast = () => {}; n.castShadow = false; } });
        if (config.anchor !== "center") { group.add(copy); return; }
        // A library model is grounded and scaled to the height the catalog asks for, like the scene does.
        const box = new Box3().setFromObject(copy), size = box.getSize(new Vector3());
        const k = config.targetHeight !== undefined && size.y > 0 ? config.targetHeight / size.y : 1;
        group.scale.setScalar(k);
        group.position.y = y - box.min.y * k;
        group.add(copy);
      });
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      state.scene.remove(group);
      group.clear();
      material.dispose();
    },
  };
}
function Ghost({ kind, at, y, valid }: { kind: string; at: [number, number]; y: number; valid: boolean }) {
  const rotation = useGameStore(() => session.rotation);
  return <EngineDrawMount create={() => ghostDraw(kind, at, y, valid, rotation)} deps={[kind, at, y, valid, rotation]} />;
}

/**
 * The lot's raised ground: one grassy block per cell above the lawn, stepped by level, with a
 * lighter top so the steps read from the park camera.
 */
function landDraw(cells: { col: number; row: number; level: number }[]): EngineDraw {
  const group = new Group();
  const sideGeometry = new BoxGeometry(GRID, 1, GRID);
  const topGeometry = new PlaneGeometry(GRID, GRID);
  const evenSide = new MeshStandardMaterial({ color: "#5f9a47" });
  const oddSide = new MeshStandardMaterial({ color: "#6aa851" });
  const evenTop = new MeshStandardMaterial({ color: "#79b85a" });
  const oddTop = new MeshStandardMaterial({ color: "#86c565" });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const { col, row, level } of cells) {
        const [x, z] = cellCentre(col, row);
        const h = level * LEVEL_HEIGHT;
        const even = level % 2 === 0;
        const block = new Mesh(sideGeometry, even ? evenSide : oddSide);
        block.scale.y = h;
        block.position.set(x, h / 2, z);
        block.castShadow = true;
        block.receiveShadow = true;
        block.raycast = () => {};
        const top = new Mesh(topGeometry, even ? evenTop : oddTop);
        top.rotation.x = -Math.PI / 2;
        top.position.set(x, h + 0.01, z);
        top.receiveShadow = true;
        top.raycast = () => {};
        group.add(block, top);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      sideGeometry.dispose();
      topGeometry.dispose();
      evenSide.dispose(); oddSide.dispose(); evenTop.dispose(); oddTop.dispose();
    },
  };
}
function Land() {
  const cells = useGameStore(c => raisedCells(park.of(c)).map(({ col, row, level }) => ({ col, row, level })));
  return <EngineDrawMount create={() => landDraw(cells)} deps={[cells]} />;
}

/** A flat ground cell the blueprint paints: a no-raycast plane at the hovered height. */
function cellPlaneDraw(cells: { key: string; x: number; y: number; z: number; color?: string | undefined; size?: number | undefined; opacity?: number }[]): EngineDraw {
  const group = new Group();
  const geometry = new PlaneGeometry(1, 1);
  const materials = new Map<string, MeshBasicMaterial>();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const cell of cells) {
        const key = `${cell.color ?? "#7cf3c8"}:${cell.opacity ?? 0.4}`;
        let material = materials.get(key);
        if (material === undefined) {
          material = new MeshBasicMaterial({ color: cell.color ?? "#7cf3c8", transparent: true, opacity: cell.opacity ?? 0.4, depthWrite: false });
          materials.set(key, material);
        }
        const mesh = new Mesh(geometry, material);
        const size = cell.size ?? GRID - 0.12;
        mesh.scale.set(size, size, 1);
        mesh.position.set(cell.x, cell.y + 0.22, cell.z);
        mesh.rotation.x = -Math.PI / 2;
        mesh.raycast = () => {};
        group.add(mesh);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

/** A staff post's patrol area on the ground: where its person walks and does its job. */
function patrolRingDraw(x: number, z: number, radius: number): EngineDraw {
  const group = new Group();
  group.position.set(x, 0.25, z);
  group.rotation.x = -Math.PI / 2;
  const discGeometry = new CircleGeometry(radius, 64);
  const ringGeometry = new RingGeometry(radius - 0.25, radius, 64);
  const discMaterial = new MeshBasicMaterial({ color: "#5fb8ff", transparent: true, opacity: 0.12, depthWrite: false });
  const ringMaterial = new MeshBasicMaterial({ color: "#5fb8ff", transparent: true, opacity: 0.8, depthWrite: false });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const disc = new Mesh(discGeometry, discMaterial);
      const ring = new Mesh(ringGeometry, ringMaterial);
      disc.raycast = () => {};
      ring.raycast = () => {};
      group.add(disc, ring);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      discGeometry.dispose();
      ringGeometry.dispose();
      discMaterial.dispose();
      ringMaterial.dispose();
    },
  };
}
function PatrolRing({ x, z, radius }: { x: number; z: number; radius: number }) {
  return <EngineDrawMount create={() => patrolRingDraw(x, z, radius)} deps={[x, z, radius]} />;
}

function Blueprint() {
  const host = useEngineHost();
  const ctx = useGameContext();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [down, setDown] = useState<[number, number] | null>(null);
  const selected = useGameStore(() => session.selectedTool);
  const gl = host.frame.gl, camera = host.frame.camera;
  useEffect(() => {
    const ray = new Raycaster(), plane = new Plane(new Vector3(0, 1, 0), 0), hit = new Vector3();
    const pick = (e: PointerEvent): [number, number] | null => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return [snapToTile(hit.x), snapToTile(hit.z)];
    };
    const move = (e: PointerEvent) => {
      const at = pick(e);
      if (at === null) { setHover(null); return; }
      setHover(old => old?.[0] === at[0] && old?.[1] === at[1] ? old : at);
    };
    const leave = () => setHover(null);
    // A left press with a tool in hand starts a drag: the click that ends it lays the line or the area.
    const press = (e: PointerEvent) => {
      if (e.button !== 0 || session.selectedTool === null) return;
      const at = pick(e);
      if (at === null) return;
      setDown(at);
      ctx.game.commands.run("build.dragFrom", { point: at });
    };
    const release = () => setDown(null);
    gl.domElement.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    const inspect = (e: PointerEvent) => traceNative("canvas-pointer", { screen: [e.clientX, e.clientY], camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(), viewport: gl.domElement.getBoundingClientRect().toJSON() });
    gl.domElement.addEventListener("pointerdown", inspect);
    gl.domElement.addEventListener("pointermove", move); gl.domElement.addEventListener("pointerleave", leave);
    return () => { gl.domElement.removeEventListener("pointermove", move); gl.domElement.removeEventListener("pointerleave", leave); gl.domElement.removeEventListener("pointerdown", inspect); gl.domElement.removeEventListener("pointerdown", press); window.removeEventListener("pointerup", release); };
  }, [gl, camera, ctx]);
  const view = useGameStore(c => blueprintView(c, selected, hover, down));
  const refusal = view === null ? null : view.refusal;
  useEffect(() => { if (placementHintStore.read(ctx) !== refusal) placementHintStore.write(ctx, refusal); return () => { if (placementHintStore.read(ctx) !== null) placementHintStore.write(ctx, null); }; }, [ctx, refusal]);
  if (view === null) return null;
  if (view.mode === "land") {
    return <EngineDrawMount create={() => cellPlaneDraw(view.cells.map(cell => ({ key: cell.key, x: cell.x, y: cell.y + 0.25, z: cell.z, color: view.color, size: GRID - 0.2, opacity: 0.45 })))} deps={[view]} />;
  }
  return <>
    {view.ghost !== null && <Ghost kind={view.kind} at={[view.ghost.x, view.ghost.z]} y={view.ghost.y} valid={view.refusal === null} />}
    {view.patrol !== null && <PatrolRing x={view.patrol.x} z={view.patrol.z} radius={view.patrol.radius} />}
    <EngineDrawMount create={() => cellPlaneDraw(view.cells)} deps={[view]} />
  </>;
}
type BlueprintView =
  | { mode: "land"; refusal: string | null; color: string; cells: { key: string; x: number; y: number; z: number }[] }
  | { mode: "build"; refusal: string | null; kind: string; ghost: { x: number; y: number; z: number } | null; patrol: { x: number; z: number; radius: number } | null; cells: { key: string; x: number; y: number; z: number; color: string }[] };
/** What the blueprint draws under the cursor, as plain values: it redraws when the hover, the tool or the answer changes, not every tick. */
function blueprintView(ctx: GameContext, selected: string | null, hover: [number, number] | null, down: [number, number] | null): BlueprintView | null {
  const w = park.of(ctx);
  const def = selected ? BUILDABLES[selected] ?? null : null;
  if (isLandTool(selected) && hover) {
    const landRefusal = landCheck(ctx, selected, ...hover);
    const color = landRefusal === null ? (selected === "land_raise" ? "#7cf3c8" : "#f3c87c") : "#ef7059";
    const cells = rectCells(tileAt(...(down ?? hover)), tileAt(...hover)).map(([col, row]) => { const [x, z] = cellCentre(col, row); return { key: `${col},${row}`, x, y: groundAt(w, x, z), z }; });
    return { mode: "land", refusal: landRefusal, color, cells };
  }
  if (isLandTool(selected)) return null;
  if (!def || !hover) return null;
  const refusal = hoverRefusal(placementAt(w, def.id, ...hover));
  const color = refusal === null ? "#7cf3c8" : "#ef7059";
  // Dragging a path or queue shows the whole line it will lay.
  const dragging = down !== null && LINE_KINDS.has(def.id) && tileAt(...down).join() !== tileAt(...hover).join();
  const centres = dragging ? lineCells(tileAt(...down), tileAt(...hover)).map(([c, r]) => cellCentre(c, r)) : cellCentres(def.id, cellFor(def.id, ...hover));
  const mid = centres.reduce((a, [x, z]) => [a[0] + x / centres.length, a[1] + z / centres.length], [0, 0]);
  const lineColor = (x: number, z: number) => dragging ? (placementAt(w, def.id, x, z).ok ? "#7cf3c8" : "#ef7059") : color;
  return {
    mode: "build", refusal, kind: def.id,
    ghost: dragging ? null : { x: mid[0]!, y: groundAt(w, mid[0]!, mid[1]!), z: mid[1]! },
    patrol: def.staff ? { x: mid[0]!, z: mid[1]!, radius: def.staff.patrol } : null,
    cells: centres.map(([x, z]) => ({ key: `${x},${z}`, x, y: groundAt(w, x, z), z, color: lineColor(x, z) })),
  };
}

/**
 * Dev only: `__brightwayScreen(x, z)` gives the CSS pixel a ground point shows at, so a flow can click
 * the lot with a real pointer instead of guessing pixels for a camera it does not know.
 */
function ScreenProbe() {
  const project = useWorldProjection(); const host = useEngineHost(); const ctx = useGameContext();
  const gl = host.frame.gl;
  useEffect(() => {
    const screenOf = (x: number, z: number): { x: number; y: number } | null => { const p = project([x, groundAt(park.of(ctx), x, z), z]); const r = gl.domElement.getBoundingClientRect(); return p === null || p.behind ? null : { x: r.left + p.x, y: r.top + p.y }; };
    Reflect.set(globalThis, "__brightwayScreen", screenOf);
    return () => { Reflect.deleteProperty(globalThis, "__brightwayScreen"); };
  }, [project, gl, ctx]);
  return null;
}
/** The first scenario's hint pointing at a spot on the lot: a bobbing arrow over it. */
function hintArrowDraw(x: number, z: number, groundY: number, reduced: boolean): EngineDraw {
  const group = new Group();
  group.position.set(x, groundY + 6, z);
  const bob = new Group();
  group.add(bob);
  const coneGeometry = new ConeGeometry(1.3, 2.6, 24);
  const stemGeometry = new CylinderGeometry(0.45, 0.45, 2.2, 16);
  const material = new MeshStandardMaterial({ color: "#ff5a3c", emissive: "#ff5a3c", emissiveIntensity: 0.35 });
  const cone = new Mesh(coneGeometry, material);
  cone.rotation.x = Math.PI;
  cone.raycast = () => {};
  const stem = new Mesh(stemGeometry, material);
  stem.position.y = 2.2;
  stem.raycast = () => {};
  bob.add(cone, stem);
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(state: EngineFrameState) {
      bob.position.y = reduced ? 0 : Math.sin(state.clock.elapsedTime * 3) * 0.6;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      coneGeometry.dispose();
      stemGeometry.dispose();
      material.dispose();
    },
  };
}
function HintArrow() {
  const ctx = useGameContext();
  const reduced = useGameStore(c => Boolean(c.game.store.get("park.reduced-motion")));
  const spot = useGameStore(c => { const p = currentHint(c)?.world ?? null; return p === null ? "" : `${p[0]},${p[1]}`; });
  if (spot === "") return null;
  const [x, z] = spot.split(",").map(Number);
  if (x === undefined || z === undefined) return null;
  return <EngineDrawMount create={() => hintArrowDraw(x, z, groundAt(park.of(ctx), x, z), reduced)} deps={[x, z, reduced, ctx]} />;
}

/** The selection ring under the object the build tool has in hand. */
function selectionRingDraw(x: number, z: number, radius: number): EngineDraw {
  const group = new Group();
  group.position.set(x, 0.23, z);
  group.rotation.x = -Math.PI / 2;
  const geometry = new RingGeometry(radius, radius + 0.18, 48);
  const material = new MeshBasicMaterial({ color: "#edbc5c" });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const ring = new Mesh(geometry, material);
      ring.raycast = () => {};
      group.add(ring);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}

export function BrightwayParkWorldOverlay() {
  return (
    <>
      {import.meta.env.DEV && <ScreenProbe />}
      <HintArrow />
      <SceneCaptureBinding />
      <OverlayBodies />
    </>
  );
}

function OverlayBodies() {
  const ctx = useGameContext();
  const selection = useGameStore(() => session.selectedObject);
  const objects = useGameStore(c => parkObjects(c));
  const circuit = useMemo(() => coasterCircuit(ctx), [ctx, objects]);
  const obj = parkObject(ctx, selection);
  return <>
    <Fence /><AuthoredScenery /><Land /><Blueprint />
    {objects.filter(o => MOTION[o.kind]).map(o => <RideMotion key={o.id} object={o} />)}
    {objects.filter(o => o.kind.startsWith("stall_")).map(o => <StallWares key={o.id} object={o} />)}
    {objects.filter(o => o.kind === "ride_coaster").map(o => <CoasterTrain key={o.id} object={o} circuit={circuit} />)}
    {obj?.def.staff && <PatrolRing x={obj.x} z={obj.z} radius={patrolRadius(park.of(ctx), obj.id)} />}
    {obj && <EngineDrawMount create={() => selectionRingDraw(obj.x, obj.z, Math.max(2, obj.def.footprint * 0.65))} deps={[obj.x, obj.z, obj.def.footprint]} />}
  </>;
}
