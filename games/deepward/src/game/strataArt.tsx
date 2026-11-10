/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef } from "@jgengine/core/ui/jsx";
import { AmbientLight, CircleGeometry, Color, Fog, Group, HemisphereLight, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SpotLight } from "three";
import { useGameStore } from "@jgengine/ui/hooks";
import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
import { EngineDrawMount, SceneObjectGroup, SceneObjectPortal, meshDraw, useEngineDraw, useSceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";
import { stationAssets } from "./assets";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";
import { BAYS, FABRICATOR, FRAGMENTS, HAZARDS, LIFTS, NODES, PRINTER_ZERO, SUPPLIES, type Place } from "../world";
import { IndustrialBox, IndustrialCylinder, PALETTE as C, signTexture, type Triple } from "./art";
import { SPECIES, type Creature } from "./fauna";
import { STRATA } from "./strata";
import { SuitStand } from "./fixtureArt";
import type { Dive } from "./state";
import type { Deep } from "./deep";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import type { ReactNode } from "@jgengine/core/ui/jsx";

/**
 * What the strata below receiving look like: the seams, shelves, wrecks and lifts the descent is
 * played through, the prints that live there, and Marrow's bays as the base fills up. Each floor
 * keeps the station's industrial kit and changes its light, fog and colour.
 */
function Sign({ at, title, sub, color = C.cyan, turn = 0, width = 2.4 }: { at: Triple; title: string; sub: string; color?: string; turn?: number; width?: number }) {
  const texture = useMemo(() => signTexture(title, sub, color), [title, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <EngineDrawMount create={() => meshDraw({
    geometry: new PlaneGeometry(width, width / 3),
    material: new MeshBasicMaterial({ map: texture }),
    position: at,
    rotation: [0, turn, 0],
  })} deps={[at, turn, width, texture]} />;
}
function Glow({ at, radius, color, opacity = 0.9 }: { at: Triple; radius: number; color: string; opacity?: number }) {
  return <EngineDrawMount create={() => meshDraw({
    geometry: new SphereGeometry(radius, 12, 10),
    material: new MeshBasicMaterial({ color, transparent: true, opacity }),
    position: at,
  })} deps={[at, radius, color, opacity]} />;
}
const RESOURCE = { wire: C.amber, polymer: "#c8d3b5", cells: "#8bd7bf", ink: "#be9adc" } as const;

/** Seams, cable runs and scrap heaps: lit while they still yield, dark once worked out. */
function Nodes({ place, harvested }: { place: Place; harvested: Dive["harvested"] }) {
  return <>{NODES.filter(node => node.place === place).map(node => {
    const spent = (harvested[node.id] ?? 0) >= node.amount, color = spent ? C.panel : RESOURCE[node.yields];
    return <SceneObjectGroup key={node.id} position={[node.at[0], 0, node.at[2]]}>
      {node.tool === "drill" ? <>
        {[[-0.3, 0.5, 0.1, 1.1], [0.2, 0.4, -0.2, 0.8], [0.05, 0.75, 0.25, 1.5]].map(([x, h, z, s], i) =>
          <IndustrialCylinder key={i} at={[x!, h! * s! * 0.5, z!]} radius={0.16 * s!} tip={0.02} length={h! * s!} surface="glass" color={color} emission={spent ? 0 : 1.1} />)}
        <IndustrialBox at={[0, 0.06, 0]} size={[1.3, 0.12, 1.1]} color="#241a2c" surface="rubber" />
      </> : node.tool === "cutter" ? <>
        <IndustrialBox at={[0, 1.1, 0]} size={[0.5, 2.2, 0.5]} color={C.steel} surface="steel" />
        {[0.5, 0.9, 1.3, 1.7].map(y => <IndustrialCylinder key={y} at={[0, y, 0.3]} turn={[0, 0, Math.PI / 2]} radius={0.06} length={0.9} color={color} emission={spent ? 0 : 0.5} />)}
        <IndustrialBox at={[0, 2.05, 0.27]} size={[0.42, 0.12, 0.04]} color={spent ? C.panel : C.danger} emission={spent ? 0 : 0.8} />
      </> : <>
        <IndustrialBox at={[0, 0.22, 0]} size={[1.1, 0.44, 0.8]} turn={[0, 0.3, 0]} color={C.wall} />
        <IndustrialBox at={[0.15, 0.55, 0.05]} size={[0.6, 0.3, 0.5]} turn={[0.2, -0.4, 0.1]} color={color} emission={spent ? 0 : 0.35} />
      </>}
    </SceneObjectGroup>;
  })}</>;
}
/** Shelves of rations and flasks: full until taken this Life. */
function Supplies({ place, collected }: { place: Place; collected: Dive["collected"] }) {
  return <>{SUPPLIES.filter(supply => supply.place === place).map(supply => {
    const taken = collected.includes(`supply:${supply.id}`), color = supply.gives === "ration" ? C.amber : "#7fc6ff";
    return <SceneObjectGroup key={supply.id} position={[supply.at[0], 0, supply.at[2]]}>
      <IndustrialBox at={[0, 0.45, 0]} size={[1, 0.9, 0.6]} color={C.panel} />
      {!taken && Array.from({ length: supply.amount }, (_, i) => <IndustrialCylinder key={i} at={[-0.25 + i * 0.25, 1.05, 0]} radius={0.09} length={0.24} color={color} emission={0.6} />)}
      <IndustrialBox at={[0, 0.7, 0.31]} size={[0.7, 0.08, 0.02]} color={taken ? C.panel : color} emission={taken ? 0 : 0.7} />
    </SceneObjectGroup>;
  })}</>;
}
/** Wrecks, suits, logs and the relay: what the scanner reads. A scanned one goes dark. */
function Fragments({ place, scanned }: { place: Place; scanned: Deep["scanned"] }) {
  return <>{FRAGMENTS.filter(fragment => fragment.place === place).map(fragment => {
    const done = scanned.includes(fragment.id), mark = done ? C.panel : C.cyan;
    const isLog = fragment.entry.startsWith("log-");
    return <SceneObjectGroup key={fragment.id} position={[fragment.at[0], 0, fragment.at[2]]}>
      {fragment.entry === "log-relay" ? <>
        <IndustrialCylinder at={[0, 1.6, 0]} radius={0.08} length={3.2} color={C.steel} surface="steel" />
        <IndustrialBox at={[0, 0.4, 0]} size={[0.8, 0.8, 0.6]} color={C.panel} />
        <Glow at={[0, 3.25, 0]} radius={0.12} color={done ? C.panel : C.danger} />
      </> : isLog ? <>
        <IndustrialBox at={[0, 0.55, 0]} size={[0.6, 1.1, 0.4]} color={C.wall} />
        <IndustrialBox at={[0, 1.0, 0.21]} size={[0.44, 0.3, 0.02]} color={done ? C.panel : C.amber} emission={done ? 0 : 0.9} />
      </> : fragment.entry === "seal2" || fragment.entry === "seal3" ? <>
        <SuitStand canvas={fragment.entry === "seal3" ? "#8f8a68" : "#c08c52"} />
      </> : <>
        <IndustrialBox at={[0, 0.3, 0]} size={[1.8, 0.5, 1.1]} turn={[0.08, 0.5, 0.12]} color={C.steel} surface="steel" />
        <IndustrialBox at={[0.3, 0.75, 0.1]} size={[0.6, 0.5, 0.7]} turn={[0.3, 0.2, -0.2]} color={C.brass} surface="brass" />
      </>}
      <Glow at={[0, 2.15, 0]} radius={0.07} color={mark} opacity={done ? 0.3 : 0.9} />
    </SceneObjectGroup>;
  })}</>;
}
/** Lift cages, with where they go and whether the cage code is known. */
function Lifts({ place, signal, relay, crawler }: { place: Place; signal: boolean; relay: boolean; crawler: boolean }) {
  return <>{LIFTS.filter(lift => lift.place === place).map(lift => {
    const to = STRATA[lift.to], up = to.pressure < (place === "home" ? 0 : STRATA[place].pressure);
    const locked = !up && ((lift.to === "wells" && !signal) || (lift.to === "choir" && !relay));
    const color = locked ? C.danger : up ? C.cyan : C.amber;
    return <SceneObjectGroup key={lift.id} position={[lift.at[0], 0, lift.at[2]]}>
      {[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].map(([x, z]) => <IndustrialBox key={`${x}${z}`} at={[x!, 1.6, z!]} size={[0.12, 3.2, 0.12]} color={C.steel} surface="steel" />)}
      <IndustrialBox at={[0, 0.04, 0]} size={[2.3, 0.08, 2.3]} color="#2b3133" surface="rubber" />
      <IndustrialBox at={[0, 3.2, 0]} size={[2.4, 0.14, 2.4]} color={C.steel} surface="steel" />
      <IndustrialBox at={[0, 0.1, 0]} size={[1.6, 0.03, 0.1]} color={color} emission={0.9} />
      <Sign at={[0, 2.6, 1.2]} title={up && crawler ? "CRAWLER / HOME" : `${up ? "UP" : "DOWN"} · ${to.numeral} ${to.name.toUpperCase()}`} sub={locked ? "CAGE CODE REQUIRED" : `${to.metres} M / PRESSURE ${to.pressure}`} color={color} />
      <Sign at={[0, 2.6, -1.2]} title={up && crawler ? "CRAWLER / HOME" : `${up ? "UP" : "DOWN"} · ${to.numeral} ${to.name.toUpperCase()}`} sub={locked ? "CAGE CODE REQUIRED" : `${to.metres} M / PRESSURE ${to.pressure}`} color={color} turn={Math.PI} />
    </SceneObjectGroup>;
  })}</>;
}
function Hazards({ place }: { place: Place }) {
  return <>{HAZARDS.filter(hazard => hazard.place === place && hazard.hazard !== "steam").map(hazard =>
    <EngineDrawMount key={hazard.id} create={() => meshDraw({
      geometry: new PlaneGeometry(hazard.w, hazard.d),
      material: hazard.hazard === "frost"
        ? new MeshStandardMaterial({ color: "#cfe8ff", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75, emissive: "#4f7fa8", emissiveIntensity: 0.25 })
        : new MeshStandardMaterial({ color: "#2a0f3a", roughness: 0.05, metalness: 0.3, emissive: "#6a2bb0", emissiveIntensity: 0.35 }),
      position: [hazard.x, 0.02, hazard.z],
      rotation: [-Math.PI / 2, 0, 0],
    })} deps={[hazard.id, hazard.w, hazard.d, hazard.hazard, hazard.x, hazard.z]} />)}</>;
}
function PrinterZero({ taken }: { taken: boolean }) {
  return <SceneObjectGroup position={[PRINTER_ZERO[0], 0, PRINTER_ZERO[2]]}>
    <IndustrialBox at={[0, 1.1, 0]} size={[4.2, 2.2, 2.4]} color="#3a2426" />
    <IndustrialBox at={[0, 2.8, -0.4]} size={[3.6, 1.2, 1.4]} color={C.steel} surface="steel" />
    <IndustrialBox at={[0, 1.3, 1.22]} size={[2.4, 0.6, 0.04]} color={taken ? C.panel : C.danger} emission={taken ? 0.1 : 1.3} />
    {[-1.6, 1.6].map(x => <IndustrialCylinder key={x} at={[x, 2.4, 0.6]} radius={0.22} length={4.8} color={C.ink} />)}
    <Sign at={[0, 4.1, 0.3]} title="PRINTER ZERO" sub={taken ? "PATTERN COPIED" : "PATTERN 406 / ORIGINAL"} color={C.danger} width={3.2} />
  </SceneObjectGroup>;
}
const FAUNA_MODEL: Readonly<Record<Creature["species"], string>> = { hand: "deepward/fauna/hand", courier: "deepward/fauna/courier", overrun: "deepward/fauna/tank-crawler" };
/** The creature's clip: the strike's own countdown holds the windup pose, otherwise it walks or idles. */
export function faunaAnimation(creature: Pick<Creature, "species" | "mode" | "windup">): ModelAnimationConfig {
  const def = SPECIES[creature.species];
  if (creature.mode === "winding" && def.strike !== null) return { clip: "windup", paused: true, time: 0.7 * (1 - Math.max(0, Math.min(1, creature.windup / def.strike.windup))), loop: false };
  const moving = creature.mode === "flee" || creature.mode === "stalk" || creature.mode === "attack";
  return { clip: moving ? "walk" : "idle", loop: true, timeScale: moving ? Math.max(0.6, def.run / 3) : 1 };
}
const hunting = (creature: Creature): boolean => creature.mode === "winding" || creature.mode === "attack" || creature.mode === "stalk";
/** Reads one creature as it is now, or undefined once it is gone. */
export type CreatureRead = (id: string) => Creature | undefined;
/**
 * A creature's body: a rigged hand, courier or tank-crawler from the same pipeline as the Fitter. It
 * walks on the render frame; React re-renders it only when its clip or its health bar changes.
 */
function CreatureModel({ id, read }: { id: string; read: CreatureRead }) {
  const group = useMemo(() => new Group(), []);
  const look = useGameStore(() => {
    const creature = read(id);
    return creature === undefined ? null : { species: creature.species, mode: creature.mode, windup: creature.mode === "winding" ? creature.windup : 0, health: creature.health };
  });
  useFrameTask(() => {
    const creature = read(id);
    if (creature === undefined) return;
    group.position.set(creature.at[0], 0, creature.at[2]);
    group.rotation.y = creature.facing;
  });
  useSceneObjectAttach(group);
  if (look === null) return null;
  const def = SPECIES[look.species], asset = stationAssets.resolve(FAUNA_MODEL[look.species]);
  if (asset === null) throw new Error(`Deepward is missing the ${look.species} model`);
  return <SceneObjectPortal object={group}>
    <IsolatedEntityModel instanceId={id} model={{ ...asset, anchor: "origin", shadows: "both", animation: faunaAnimation(look) }} />
    {look.health < def.health && <IndustrialBox at={[0, def.size * 2.4 + 0.4, 0]} size={[0.8 * Math.max(0.05, look.health / def.health), 0.06, 0.06]} color={C.danger} emission={0.9} />}
  </SceneObjectPortal>;
}
function Lures({ thrown }: { thrown: Dive["thrown"] }) {
  return <>{thrown.map(lure => <SceneObjectGroup key={lure.id} position={[lure.at[0], 0, lure.at[2]]}>
    <IndustrialCylinder at={[0, 0.1, 0]} radius={0.09} length={0.2} color={C.danger} emission={0.9} />
    <EngineDrawMount create={() => meshDraw({
      geometry: new CircleGeometry(0.6, 20),
      material: new MeshBasicMaterial({ color: "#6e1010", transparent: true, opacity: 0.7 }),
      position: [0, 0.015, 0],
      rotation: [-Math.PI / 2, 0, 0],
    })} deps={[]} />
  </SceneObjectGroup>)}</>;
}
/** What the floor's fixed dressing shows: what has been worked, taken and scanned this Life. */
export interface StratumMarks {
  crawler: boolean;
  harvested: Dive["harvested"];
  collected: Dive["collected"];
  scanned: Deep["scanned"];
  zeroTaken: boolean;
  /** The story facts that unlock the lifts down to the wells and the choir. */
  signal: boolean;
  relay: boolean;
}
/**
 * Everything fixed that belongs to the floor the diver stands on below receiving, plus receiving's own
 * lift. It changes only when something is worked, taken or scanned; what moves is {@link StratumLife}.
 */
export function StratumDressing({ place, marks }: { place: Place; marks: StratumMarks }) {
  return <>
    <Lifts place={place} signal={marks.signal} relay={marks.relay} crawler={marks.crawler} />
    <Nodes place={place} harvested={marks.harvested} />
    <Supplies place={place} collected={marks.collected} />
    <Fragments place={place} scanned={marks.scanned} />
    <Hazards place={place} />
    {place === "choir" && <PrinterZero taken={marks.zeroTaken} />}
  </>;
}
/** The overrun crawlers' alarm lamps: a fixed pair, so a crawler arriving or dying never changes the scene's lights. */
export const ALARM_LAMPS = 2;
/** The hunting crawlers on `place` whose alarm lamps burn, at most {@link ALARM_LAMPS}. */
export function alarmCreatures(fauna: Dive["fauna"], place: Place): Creature[] {
  const alarms: Creature[] = [];
  for (const creature of Object.values(fauna)) {
    if (alarms.length === ALARM_LAMPS) break;
    if (creature.place === place && creature.health > 0 && creature.species === "overrun" && hunting(creature)) alarms.push(creature);
  }
  return alarms;
}
/** Where a crawler's alarm lamp hangs: ahead of it and overhead. */
export function alarmLampAt(creature: Creature): Triple {
  return [creature.at[0] + Math.sin(creature.facing) * 4.6, 2.8, creature.at[2] + Math.cos(creature.facing) * 4.6];
}
/**
 * What moves on the floor: its living creatures (by id) and thrown lures, re-rendered only when one
 * arrives, dies, lands or burns out. Their alarm lamps are mounted in every place, with the station's other lights.
 */
export function StratumLife({ creatures, read, thrown }: { creatures: readonly string[]; read: CreatureRead; thrown: Dive["thrown"] }) {
  return <>
    {creatures.map(id => <CreatureModel key={id} id={id} read={read} />)}
    <Lures thrown={thrown} />
  </>;
}
const MODULE_LOOK: Record<string, { color: string; build: (ready: boolean) => ReactNode }> = {
  generator: { color: C.cyan, build: ready => <>
    <IndustrialCylinder at={[0, 0.8, 0]} radius={0.6} length={1.6} color={C.steel} surface="steel" />
    <IndustrialCylinder at={[0, 0.8, 0]} radius={0.62} length={0.12} color={C.cyan} emission={ready ? 1.2 : 0} />
  </> },
  still: { color: "#7fc6ff", build: ready => <>
    <IndustrialCylinder at={[0, 0.9, 0]} radius={0.45} length={1.8} color="#5d7480" surface="steel" />
    <IndustrialCylinder at={[0.55, 1.2, 0]} radius={0.06} length={1.4} color={C.brass} surface="brass" />
    <IndustrialBox at={[0, 0.5, 0.46]} size={[0.3, 0.3, 0.02]} color="#7fc6ff" emission={ready ? 0.9 : 0} />
  </> },
  growbed: { color: "#8fd47a", build: ready => <>
    <IndustrialBox at={[0, 0.35, 0]} size={[1.6, 0.7, 1]} color={C.panel} />
    <IndustrialBox at={[0, 0.74, 0]} size={[1.45, 0.08, 0.85]} color="#3d2a1c" surface="rubber" />
    {ready && [-0.5, -0.17, 0.17, 0.5].map(x => <IndustrialCylinder key={x} at={[x, 0.95, 0]} radius={0.12} tip={0.02} length={0.4} color="#8fd47a" emission={0.4} />)}
    <IndustrialBox at={[0, 1.6, 0]} size={[1.6, 0.06, 0.3]} color="#ffd9a8" emission={ready ? 1 : 0} />
  </> },
  scrubber: { color: "#c8d3b5", build: ready => <>
    <IndustrialBox at={[0, 0.75, 0]} size={[1, 1.5, 0.8]} color={C.wall} />
    <IndustrialCylinder at={[0, 1.0, 0.41]} turn={[Math.PI / 2, 0, 0]} radius={0.35} length={0.05} color={ready ? "#c8d3b5" : C.panel} emission={ready ? 0.5 : 0} />
  </> },
  mast: { color: C.amber, build: ready => <>
    <IndustrialCylinder at={[0, 2.2, 0]} radius={0.08} length={4.4} color={C.steel} surface="steel" />
    {[1.4, 2.4, 3.4].map(y => <IndustrialBox key={y} at={[0, y, 0]} size={[0.9 - y * 0.15, 0.05, 0.05]} color={C.brass} surface="brass" />)}
    <Glow at={[0, 4.45, 0]} radius={0.1} color={ready ? C.danger : C.panel} />
  </> },
};
/** Marrow's six bays and whatever has been built in them, plus the fabricator itself. */
export function MarrowBays({ world }: { world: WorldModel }) {
  const instances = world.instances(), power = world.num("marrow.power");
  return <>
    <SceneObjectGroup position={[FABRICATOR[0], 0, FABRICATOR[2]]}>
      <IndustrialBox at={[0, 0.6, 0]} size={[1.8, 1.2, 1.1]} color={C.steel} surface="steel" />
      <IndustrialBox at={[0, 1.55, -0.3]} size={[1.6, 0.7, 0.4]} color={C.panel} />
      <IndustrialBox at={[0, 1.55, -0.09]} size={[1.2, 0.45, 0.02]} color={C.cyan} emission={0.9} />
      <IndustrialCylinder at={[0, 1.25, 0.15]} radius={0.08} length={0.4} color={C.ink} />
      <Sign at={[0, 2.5, -0.3]} title="FABRICATOR" sub="BLUEPRINTS / BAYS" color={C.cyan} width={2.2} />
    </SceneObjectGroup>
    {BAYS.map((bay, index) => {
      const built = instances.find(instance => instance.slot === bay.id) ?? null;
      const look = built === null ? null : MODULE_LOOK[built.kind] ?? null;
      const running = built !== null && built.ready && power >= 0;
      return <SceneObjectGroup key={bay.id} position={[bay.at[0], 0, bay.at[2]]} rotationY={bay.turn}>
        <IndustrialBox at={[0, 0.015, 0]} size={[1.9, 0.03, 1.9]} color={built === null ? "#2b3133" : "#3a4448"} surface="rubber" />
        {[-0.95, 0.95].map(x => <IndustrialBox key={x} at={[x, 0.035, 0]} size={[0.06, 0.02, 1.9]} color={C.amber} emission={0.4} />)}
        {look !== null && built !== null && <SceneObjectGroup scale={built.ready ? undefined : [1, 0.5, 1]}>{look.build(running)}</SceneObjectGroup>}
        {built !== null && !built.ready && [-0.8, 0.8].map(x => <IndustrialBox key={x} at={[x, 1, 0.8]} size={[0.06, 2, 0.06]} color={C.amber} />)}
        <Sign at={[0, 2.3, -0.9]} title={built === null ? `BAY ${index + 1}` : built.label.toUpperCase()} sub={built === null ? "EMPTY / BUILD AT FABRICATOR" : !built.ready ? "BUILDING" : running ? "RUNNING" : "NO POWER"} color={built === null ? C.panel : running ? (look?.color ?? C.cyan) : C.danger} width={1.8} />
      </SceneObjectGroup>;
    })}
  </>;
}
/**
 * Each floor's air: fog closes in and the ambient light drops the deeper you go. The shell owns the
 * lights and fog; this only retunes them when the floor changes.
 */
const STRATA_FILL = 1;
export function StratumAtmosphere({ place }: { place: Place }) {
  const host = useEngineHost();
  useEffect(() => {
    const scene = host.frame.rootScene ?? host.frame.scene;
    const fog = place === "home" ? { color: C.black, near: 12, far: 48 } : STRATA[place].fog;
    // Each floor scales the third-strength base fill by its own ambient ratio.
    const ambient = place === "home" ? 1 : STRATA[place].ambient / STRATA.vault.ambient * STRATA_FILL;
    if (scene.fog instanceof Fog) { scene.fog.color.set(fog.color); scene.fog.near = fog.near; scene.fog.far = fog.far; }
    if (scene.background instanceof Color) scene.background.set(place === "home" || place === "vault" ? C.black : fog.color);
    scene.traverse((object) => {
      if (!(object instanceof AmbientLight) && !(object instanceof HemisphereLight)) return;
      const base = (object.userData["deepwardBase"] as number | undefined) ?? object.intensity;
      object.userData["deepwardBase"] = base;
      object.intensity = base * ambient;
    });
  }, [place, host]);
  return null;
}
/** The headlamp: a spot on the camera. Always mounted so switching it never recompiles a shader. */
export function Headlamp({ on }: { on: boolean }) {
  const onRef = useRef(on);
  onRef.current = on;
  useEngineDraw(() => {
    const light = new SpotLight("#fff1d6", 0, 22, 0.55, 0.55, 0.8);
    light.userData["haze"] = false;
    return {
      mount(state: EngineFrameState) {
        state.rootScene?.add(light.target) ?? state.scene.add(light.target);
        state.scene.add(light);
      },
      frame(state: EngineFrameState) {
        const camera = state.camera;
        camera.getWorldDirection(light.target.position);
        light.position.copy(light.target.position).multiplyScalar(-0.7).add(camera.position);
        light.target.position.multiplyScalar(6).add(camera.position);
        light.intensity = onRef.current ? 5 : 0;
      },
      dispose(state: EngineFrameState) {
        (state.rootScene ?? state.scene).remove(light.target);
        state.scene.remove(light);
        light.dispose();
      },
    } satisfies EngineDraw;
  }, []);
  return null;
}
