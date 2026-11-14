/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useRef } from "@jgengine/core/ui/jsx";
import { AdditiveBlending, BoxGeometry, CircleGeometry, Color, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Quaternion, RingGeometry, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from "three";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { houseAssets } from "./assets";
import { EngineDrawMount, disposeObjectTree } from "@jgengine/core/frame/useEngineDraw.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import type { EditorVolume } from "@jgengine/core/editor/types";
import { TEMPLATES, type RoomTemplate } from "../world";
import { houseMaterial, isHouseMaterial, type HouseMaterial } from "./houseMaterials";
import { itemMesh } from "./itemArt";
import { animateAnimal, poseThreat, threatMesh, upgradeToAnimal, webMesh } from "./threatArt";
import { viewStore } from "./controls";
import { kindOf, ITEMS, type ItemKind } from "./loot";
import { LITTLES } from "./littles";
import { lightsOn, roomOf, hasGear, type Run } from "./state";
import { nearby, trainIn, ventOpen } from "./controls";
import type { UpgradeId } from "./burrow";

const rotation = new Euler(0, 0, 0, "YXZ"), quat = new Quaternion(), pos = new Vector3(), scl = new Vector3();
function compose(out: Matrix4, p: EditorVolume): Matrix4 {
  const meta = p.meta ?? {};
  rotation.set(Number(meta["tilt"] ?? 0), Number(meta["turn"] ?? 0), Number(meta["roll"] ?? 0), "YXZ");
  quat.setFromEuler(rotation);
  pos.set(p.center.x, p.center.y, p.center.z);
  if (p.shape === "box" && p.halfExtents) scl.set(p.halfExtents.x * 2, p.halfExtents.y * 2, p.halfExtents.z * 2);
  else if (p.shape === "sphere") scl.setScalar(p.radius ?? 1);
  else scl.set(p.radius ?? 1, p.height ?? 1, p.radius ?? 1);
  return out.compose(pos, quat, scl);
}

/** A room's authored props, batched by shape, surface and colour into instanced meshes, plus its floor. */
function roomDraw(template: RoomTemplate, levels: Partial<Record<UpgradeId, number>>): EngineDraw {
  const group = new Group();
  return {
    mount(state: EngineFrameState) {
      const groups = new Map<string, EditorVolume[]>();
      for (const p of template.props) {
        const upgrade = p.meta?.["upgrade"];
        if (typeof upgrade === "string" && (levels[upgrade as UpgradeId] ?? 0) < Number(p.meta?.["level"] ?? 1)) continue;
        const key = `${p.shape}|${String(p.meta?.["material"])}|${p.color}|${String(p.meta?.["glow"] ?? 0)}`;
        const list = groups.get(key) ?? []; list.push(p); groups.set(key, list);
      }
      const m = new Matrix4();
      for (const parts of groups.values()) {
        const first = parts[0]!, material = isHouseMaterial(first.meta?.["material"]) ? first.meta["material"] as HouseMaterial : "paint";
        const geometry: BufferGeometry = first.shape === "box" ? new BoxGeometry(1, 1, 1) : first.shape === "sphere" ? new SphereGeometry(1, 18, 12) : new CylinderGeometry(1, 1, 1, 24);
        const mesh = new InstancedMesh(geometry, houseMaterial(material, first.color ?? "#cccccc", Number(first.meta?.["glow"] ?? 0)), parts.length);
        parts.forEach((p, i) => mesh.setMatrixAt(i, compose(m, p)));
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
        mesh.castShadow = material !== "emissive" && material !== "glass"; mesh.receiveShadow = true;
        group.add(mesh);
      }
      // The floor itself, a little larger than the walkable patch so the edges read as the room going on.
      const a = template.area, grow = template.elevated > 0 ? 0 : 54;
      const floor = new Mesh(new BoxGeometry(a.w + grow * 2, 1, a.d + grow * 2), houseMaterial(isHouseMaterial(template.floor) ? template.floor : "wood", template.floorColor));
      floor.position.set(a.x, -0.5, a.z); floor.receiveShadow = true; group.add(floor);
      // Floor-level rooms are a corner of a giant room: its far walls stand off in the haze, so the
      // edge of the patch never opens onto the void.
      if (template.elevated === 0 && template.zone !== "burrow") {
        const reach = 52, height = 220, far = houseMaterial("plaster", "#6d5a48");
        for (const [x, z, w, d] of [[a.x, a.z - a.d / 2 - reach, a.w + reach * 2, 2], [a.x, a.z + a.d / 2 + reach, a.w + reach * 2, 2], [a.x - a.w / 2 - reach, a.z, 2, a.d + reach * 2], [a.x + a.w / 2 + reach, a.z, 2, a.d + reach * 2]] as const) {
          const wall = new Mesh(new BoxGeometry(w, height, d), far);
          wall.position.set(x, height / 2, z); wall.receiveShadow = true; group.add(wall);
        }
      }
      if (template.ceiling > 0) {
        const lid = new Mesh(new BoxGeometry(a.w + 60, 1, a.d + 60), new MeshStandardMaterial({ color: "#1d1712", roughness: 1 }));
        lid.position.set(a.x, template.ceiling + 3.5, a.z); group.add(lid);
      }
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) { state.scene.remove(group); disposeObjectTree(group); group.clear(); },
  };
}
export function RoomBuild({ templateId, levels }: { templateId: string; levels: Partial<Record<UpgradeId, number>> }) {
  const template = TEMPLATES[templateId];
  const key = JSON.stringify(levels);
  return template === undefined ? null : <EngineDrawMount create={() => roomDraw(template, levels)} deps={[templateId, key]} />;
}

const gltf = new GLTFLoader();
/**
 * The room's catalog models (a loaf, a mug, a couch in the haze) loaded from the provisioned packs
 * and scaled so their longest side is the authored size: a household object at a Little's scale.
 */
export function ModelLayer({ templateId }: { templateId: string }) {
  const template = TEMPLATES[templateId];
  if (template === undefined || template.models.length === 0) return null;
  return <EngineDrawMount create={() => {
    const root = new Group();
    const draws: { draw: EngineDraw; holder: Group; state: EngineFrameState | null }[] = [];
    for (const slot of template.models) {
      const ref = houseAssets.resolve(slot.model);
      if (ref === null || ref.dims === undefined) continue;
      const { dims } = ref, height = (dims.maxY ?? 1) - (dims.minY ?? 0);
      const scale = slot.size / Math.max(dims.footprint.w, dims.footprint.d, height);
      const holder = new Group();
      holder.position.set(slot.at[0] - (dims.center?.x ?? 0) * scale, slot.at[1] - (dims.minY ?? 0) * scale, slot.at[2] - (dims.center?.z ?? 0) * scale);
      holder.rotation.y = slot.turn; holder.scale.setScalar(scale);
      root.add(holder);
      draws.push({ holder, state: null, draw: loadDraw({ key: `gltf:${ref.url}`, load: () => gltf.loadAsync(ref.url).catch(() => null), build: (loaded, parent) => {
        // A pack that is not provisioned leaves the spot empty rather than stopping the page.
        if (loaded === null) return;
        const copy = loaded.scene.clone(true);
        copy.traverse(node => { node.castShadow = true; node.receiveShadow = true; });
        parent.add(copy);
      } }) });
    }
    return {
      mount(state: EngineFrameState) { state.scene.add(root); for (const d of draws) { d.state = childFrameState(state, d.holder); d.draw.mount?.(d.state); } },
      dispose(state: EngineFrameState) { for (const d of draws) d.draw.dispose?.(d.state ?? state); state.scene.remove(root); },
    };
  }} deps={[templateId]} />;
}

/** The room's practical lights: nightlights, moonlight, oven clocks; the big light when someone is up. */
export function RoomLights({ templateId }: { templateId: string }) {
  const ctx = useGameContext();
  const template = TEMPLATES[templateId];
  const lights = useMemo(() => Array.from({ length: 4 }, () => new PointLight("#ffffff", 0, 30, 1.4)), []);
  const big = useMemo(() => new PointLight("#ffe6b8", 0, 220, 1.2), []);
  const torch = useMemo(() => new PointLight("#ffb35c", 0, 22, 1.6), []);
  useFrameTask((state) => {
    const v = viewStore.read(ctx), run = v.run;
    const on = run !== null && v.mode === "run" && lightsOn(run, roomOf(run));
    big.intensity = on ? 2600 : 0;
    const carrying = run !== null && v.mode === "run" && hasGear(run, "torch");
    torch.intensity = carrying ? 60 * (0.9 + Math.sin(state.clock.elapsedTime * 13) * 0.06 + Math.sin(state.clock.elapsedTime * 7.3) * 0.05) : 0;
    torch.position.copy(state.camera.position); torch.position.y += 0.4;
  });
  if (template === undefined) return null;
  return <EngineDrawMount create={() => ({
    mount(state: EngineFrameState) {
      template.lamps.slice(0, 4).forEach((lamp, i) => {
        const light = lights[i]!;
        light.color = new Color(lamp.color); light.intensity = lamp.intensity * lamp.distance * 0.35; light.distance = lamp.distance * 2.2;
        light.position.set(lamp.at[0], lamp.at[1], lamp.at[2]);
      });
      big.position.set(template.area.x, 110, template.area.z + 20);
      for (const light of [...lights, big, torch]) state.scene.add(light);
    },
    dispose(state: EngineFrameState) { for (const light of [...lights, big, torch]) { state.scene.remove(light); light.intensity = 0; } },
  })} deps={[templateId]} />;
}

/** Loot on its spots: open finds lie in plain sight; tucked and hoarded ones are a rummage pile with a glint. Pip and Dot see more. */
/** The find the Little would take with E right now, so its prop can outline itself. */
const focus = { key: null as string | null };
const SPARKLE: Record<string, string> = { food: "#ffcf6b", part: "#9fd3ff", curio: "#ff9cf0", gear: "#9fe0a0", cap: "#ff8a6b" };
/**
 * Loot on its spots, made to pop from across a room: every find stands in a soft column of light with
 * a pulsing ring and a twinkle above it, coloured by what kind of thing it is (gold food, blue parts,
 * pink curios, green gear, red caps). Open finds lie in plain sight at a readable size; tucked and
 * hoarded ones are a rummage pile with the same column, dimmer. Pip's food and Dot's curios burn
 * brighter. The find E would take gets a bright outline.
 */
export function LootLayer({ run }: { run: Run }) {
  const ctx = useGameContext();
  const plan = roomOf(run), little = LITTLES[run.little];
  const taken = run.taken.join("|"), dropped = run.dropped.filter(d => d.room === run.room).map(d => d.id).join("|");
  const shown = useMemo(() => plan.loot.filter(l => !run.taken.includes(l.key)), [plan, taken]);
  const drops = useMemo(() => run.dropped.filter(d => d.room === run.room), [dropped, run.room]);
  useFrameTask(() => { const t = nearby(ctx); focus.key = t !== null && (t.act.type === "loot" || t.act.type === "pickup" || t.act.type === "toybox") ? t.id : null; });
  return <>
    {shown.map(l => {
      const kind = l.kind === "toybox" ? null : l.kind;
      const category = kind === null ? "curio" : ITEMS[kind].category;
      const sensed = kind !== null && ((little.foodSense && category === "food") || (little.shinySense && category === "curio"));
      const visible = l.spot.tier === "open" || sensed;
      return <LootProp key={l.key} id={l.key} at={l.spot.at} kind={visible ? kind : null} color={l.kind === "toybox" ? "#ffe066" : visible ? SPARKLE[category]! : "#f3e2b8"} strength={sensed ? 1.4 : visible ? 1 : 0.6} />;
    })}
    {drops.map(d => <LootProp key={d.id} id={d.id} at={d.at} kind={kindOf(d.item)} color={SPARKLE[ITEMS[kindOf(d.item)].category]!} strength={1} />)}
  </>;
}
function LootProp({ id, at, kind, color, strength }: { id: string; at: readonly [number, number, number]; kind: ItemKind | null; color: string; strength: number }) {
  return <EngineDrawMount create={() => {
    const group = new Group();
    group.position.set(at[0], 0, at[2]);
    const holder = new Group(); group.add(holder);
    if (kind !== null) {
      const mesh = itemMesh(kind); mesh.rotation.y = (at[0] * 13.1 + at[2] * 7.7) % (Math.PI * 2);
      // Readable from a few paces: small finds are shown a little larger than life.
      const def = ITEMS[kind]; mesh.scale.setScalar(Math.max(1, 1.6 - Math.max(def.w, def.h) * 0.2)); holder.add(mesh);
    } else {
      // A rummage pile: lint and a scrap of something.
      const lint = new Mesh(new SphereGeometry(1, 10, 8), new MeshStandardMaterial({ color: "#8d8478", roughness: 1 }));
      lint.scale.set(1.4, 0.55, 1.1); lint.position.y = 0.3; holder.add(lint);
      const scrap = new Mesh(new BoxGeometry(0.9, 0.06, 0.6), new MeshStandardMaterial({ color: "#d8cdb0", roughness: 1 }));
      scrap.position.set(0.5, 0.62, 0.1); scrap.rotation.y = 0.6; holder.add(scrap);
    }
    const glow = (opacity: number) => new MeshBasicMaterial({ color, transparent: true, opacity: opacity * strength, depthWrite: false, blending: AdditiveBlending });
    const beam = new Mesh(new CylinderGeometry(0.18, 0.9, 4.6, 16, 1, true), glow(0.09));
    beam.position.y = 2.3; group.add(beam);
    const ring = new Mesh(new RingGeometry(1.3, 1.6, 32), glow(0.75));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; group.add(ring);
    const twinkle = new Mesh(new SphereGeometry(0.16, 8, 6), new MeshBasicMaterial({ color: "#ffffff" }));
    twinkle.position.y = 2.2; group.add(twinkle);
    const outline = new Mesh(new TorusGeometry(1.9, 0.09, 6, 40), new MeshBasicMaterial({ color: "#fff6d8" }));
    outline.rotation.x = -Math.PI / 2; outline.position.y = 0.12; outline.visible = false; group.add(outline);
    let t = (at[0] + at[2]) % 3;
    return {
      mount(state: EngineFrameState) { state.scene.add(group); },
      frame(_state: EngineFrameState, delta: number) {
        t += delta;
        const focused = focus.key === id;
        ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
        twinkle.position.y = 2 + Math.sin(t * 2.2) * 0.35;
        twinkle.scale.setScalar(0.6 + Math.abs(Math.sin(t * 4.3)) * 0.8);
        outline.visible = focused;
        if (focused) outline.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
        holder.position.y = focused ? 0.15 + Math.sin(t * 5) * 0.08 : 0;
        holder.rotation.y = focused ? t * 1.2 : 0;
      },
      dispose(state: EngineFrameState) { state.scene.remove(group); disposeObjectTree(group); },
    };
  }} deps={[id, at[0], at[2], kind, color, strength]} />;
}

/** Doors and exits glow at the floor so a Little can find the way on and the way out. */
export function WayMarks({ run }: { run: Run }) {
  const plan = roomOf(run);
  const marks = useMemo(() => [
    ...plan.forwards.map(f => ({ id: f.to, at: f.slot.at, color: "#ffd27a", kind: f.kind })),
    ...(plan.path === "0" ? [] : [{ id: "back", at: plan.entry.slot.at, color: "#9fd3ff", kind: plan.entry.kind }]),
    ...plan.exits.map(e => ({ id: e.key, at: e.at, color: "#7dffb0", kind: e.kind })),
  ], [plan]);
  return <>{marks.map(m => <WayMark key={m.id} at={m.at} color={m.color} exit={m.color === "#7dffb0"} />)}</>;
}
function WayMark({ at, color, exit }: { at: readonly [number, number, number]; color: string; exit: boolean }) {
  return <EngineDrawMount create={() => {
    const group = new Group(); group.position.set(at[0], 0, at[2]);
    const disc = new Mesh(new CircleGeometry(exit ? 2.2 : 1.8, 32), new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; group.add(disc);
    const ring = new Mesh(new TorusGeometry(exit ? 2.2 : 1.8, 0.08, 6, 40), new MeshBasicMaterial({ color }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; group.add(ring);
    const beaconMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false });
    const beacon = new Mesh(new CylinderGeometry(0.03, 0.05, exit ? 9 : 5, 6), beaconMat);
    beacon.position.y = exit ? 4.5 : 2.5; group.add(beacon);
    const discMat = disc.material as MeshBasicMaterial;
    let t = 0;
    return {
      mount(state: EngineFrameState) { state.scene.add(group); },
      frame(s: EngineFrameState, delta: number) {
        t += delta; ring.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06);
        // Standing on a mark, its beacon and disc fade out so they never fill a Little's view.
        const near = Math.hypot(s.camera.position.x - at[0], s.camera.position.z - at[2]);
        const fade = Math.min(1, Math.max(0, (near - 2.5) / 4));
        beacon.visible = fade > 0.02; beaconMat.opacity = 0.4 * fade;
        discMat.opacity = 0.22 * fade; ring.visible = near > 5;
      },
      dispose(state: EngineFrameState) { state.scene.remove(group); disposeObjectTree(group); },
    };
  }} deps={[at[0], at[2], color]} />;
}

/** The room's hunters: built when the room's cast changes, posed every frame from the run's state. */
export function ThreatLayer({ templateId }: { templateId: string }) {
  const ctx = useGameContext();
  const cast = useStore(viewStore, v => v.mode === "run" && v.run !== null ? v.run.threats.filter(t => t.mode !== "dead").map(t => `${t.key}=${t.kind}`).join("|") : "");
  const template = TEMPLATES[templateId];
  const objects = useRef(new Map<string, Group>());
  const webs = useRef<Group | null>(null);
  useFrameTask((state) => {
    const v = viewStore.read(ctx), run = v.run;
    if (run === null) return;
    for (const s of run.threats) {
      const object = objects.current.get(s.key);
      if (object === undefined) continue;
      // A mousetrap hides in the gloom until you are nearly on it, unless Bolt is looking.
      const me = ctx.scene.entity.get(ctx.player.userId)?.position;
      const hidden = s.kind === "trap" && s.mode === "armed" && !LITTLES[run.little].trapSense && (me === undefined || Math.hypot(me[0] - s.at[0], me[2] - s.at[2]) > 6);
      object.visible = s.mode !== "dead" && !hidden;
      poseThreat(object, s, state.clock.elapsedTime, template?.ceiling ?? 0);
      animateAnimal(object, s, state.delta);
    }
  });
  return <EngineDrawMount create={() => {
    const root = new Group();
    const run = viewStore.read(ctx).run;
    objects.current.clear();
    const webGroup = new Group(); webs.current = webGroup; root.add(webGroup);
    if (run !== null) for (const s of run.threats) {
      if (s.mode === "dead") continue;
      const object = threatMesh(s.kind, s.key);
      upgradeToAnimal(object, s.kind, s.key);
      objects.current.set(s.key, object); root.add(object);
      if (s.kind === "spider") { const web = webMesh(); web.position.set(s.home[0], 0, s.home[2]); webGroup.add(web); }
    }
    return {
      mount(state: EngineFrameState) { state.scene.add(root); },
      dispose(state: EngineFrameState) { for (const o of objects.current.values()) o.userData["disposed"] = true; state.scene.remove(root); disposeObjectTree(root); objects.current.clear(); },
    };
  }} deps={[cast, templateId]} />;
}

/** A thing or two that move on their own clocks: the toy train on its track and the vent's hot breath. */
export function Clockwork({ run }: { run: Run }) {
  const ctx = useGameContext();
  const plan = roomOf(run);
  const train = plan.forwards.find(f => f.kind === "train") ?? (plan.entry.kind === "train" ? { slot: plan.entry.slot } : null);
  const vents = plan.exits.filter(e => e.kind === "vent");
  const objects = useRef<{ train: Group | null; vents: Mesh[] }>({ train: null, vents: [] });
  useFrameTask(() => {
    const r = viewStore.read(ctx).run;
    if (r === null) return;
    const t = objects.current.train;
    if (t !== null && train !== null) {
      const home = trainIn(r);
      t.position.set(train.slot.at[0] + (home ? 0 : 60), 0, train.slot.at[2] - 3);
    }
    for (const m of objects.current.vents) (m.material as MeshBasicMaterial).opacity = ventOpen(r) ? 0.05 : 0.28 + Math.sin(r.elapsed * 9) * 0.06;
  });
  return <EngineDrawMount create={() => {
    const root = new Group();
    objects.current = { train: null, vents: [] };
    if (train !== null) {
      const t = new Group();
      const engine = new Mesh(new BoxGeometry(5, 5, 7), new MeshStandardMaterial({ color: "#c0392b", roughness: 0.35 })); engine.position.y = 3; t.add(engine);
      const cab = new Mesh(new BoxGeometry(5, 3, 3), new MeshStandardMaterial({ color: "#2f6fd1", roughness: 0.35 })); cab.position.set(0, 7, -2); t.add(cab);
      for (const z of [-2.5, 2.5]) for (const x of [-2.6, 2.6]) { const wheel = new Mesh(new CylinderGeometry(1.2, 1.2, 0.5, 16), new MeshStandardMaterial({ color: "#222" })); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 1.2, z); t.add(wheel); }
      objects.current.train = t; root.add(t);
    }
    for (const e of vents) {
      const breath = new Mesh(new CylinderGeometry(2.5, 4, 8, 16, 1, true), new MeshBasicMaterial({ color: "#ffd7a8", transparent: true, opacity: 0, depthWrite: false }));
      breath.position.set(e.at[0], 4, e.at[2]); objects.current.vents.push(breath); root.add(breath);
    }
    return { mount(state: EngineFrameState) { state.scene.add(root); }, dispose(state: EngineFrameState) { state.scene.remove(root); disposeObjectTree(root); } };
  }} deps={[plan.path, run.seed]} />;
}
