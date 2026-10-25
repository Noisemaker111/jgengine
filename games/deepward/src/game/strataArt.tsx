import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AmbientLight, Color, Fog, HemisphereLight, SpotLight, type Object3D } from "three";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";
import { BAYS, FABRICATOR, FRAGMENTS, HAZARDS, LIFTS, NODES, PRINTER_ZERO, SUPPLIES, type Place } from "../world";
import { IndustrialBox, IndustrialCylinder, PALETTE as C, signTexture, type Triple } from "./art";
import { SPECIES, type Creature } from "./fauna";
import { STRATA } from "./strata";
import { SuitStand } from "./fixtureArt";
import type { Dive } from "./state";
import type { Deep } from "./deep";

/**
 * What the strata below receiving look like: the seams, shelves, wrecks and lifts the descent is
 * played through, the prints that live there, and Marrow's bays as the base fills up. Each floor
 * keeps the station's industrial kit and changes its light, fog and colour.
 */
function Sign({ at, title, sub, color = C.cyan, turn = 0, width = 2.4 }: { at: Triple; title: string; sub: string; color?: string; turn?: number; width?: number }) {
  const texture = useMemo(() => signTexture(title, sub, color), [title, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={at} rotation-y={turn}><planeGeometry args={[width, width / 3]} /><meshBasicMaterial map={texture} /></mesh>;
}
function Glow({ at, radius, color, opacity = 0.9 }: { at: Triple; radius: number; color: string; opacity?: number }) {
  return <mesh position={at}><sphereGeometry args={[radius, 12, 10]} /><meshBasicMaterial color={color} transparent opacity={opacity} /></mesh>;
}
const RESOURCE = { wire: C.amber, polymer: "#c8d3b5", cells: "#8bd7bf", ink: "#be9adc" } as const;

/** Seams, cable runs and scrap heaps: lit while they still yield, dark once worked out. */
function Nodes({ place, dive }: { place: Place; dive: Dive }) {
  return <>{NODES.filter(node => node.place === place).map(node => {
    const spent = (dive.harvested[node.id] ?? 0) >= node.amount, color = spent ? C.panel : RESOURCE[node.yields];
    return <group key={node.id} position={[node.at[0], 0, node.at[2]]}>
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
    </group>;
  })}</>;
}
/** Shelves of rations and flasks: full until taken this Life. */
function Supplies({ place, dive }: { place: Place; dive: Dive }) {
  return <>{SUPPLIES.filter(supply => supply.place === place).map(supply => {
    const taken = dive.collected.includes(`supply:${supply.id}`), color = supply.gives === "ration" ? C.amber : "#7fc6ff";
    return <group key={supply.id} position={[supply.at[0], 0, supply.at[2]]}>
      <IndustrialBox at={[0, 0.45, 0]} size={[1, 0.9, 0.6]} color={C.panel} />
      {!taken && Array.from({ length: supply.amount }, (_, i) => <IndustrialCylinder key={i} at={[-0.25 + i * 0.25, 1.05, 0]} radius={0.09} length={0.24} color={color} emission={0.6} />)}
      <IndustrialBox at={[0, 0.7, 0.31]} size={[0.7, 0.08, 0.02]} color={taken ? C.panel : color} emission={taken ? 0 : 0.7} />
    </group>;
  })}</>;
}
/** Wrecks, suits, logs and the relay: what the scanner reads. A scanned one goes dark. */
function Fragments({ place, deep }: { place: Place; deep: Deep }) {
  return <>{FRAGMENTS.filter(fragment => fragment.place === place).map(fragment => {
    const done = deep.scanned.includes(fragment.id), mark = done ? C.panel : C.cyan;
    const isLog = fragment.entry.startsWith("log-");
    return <group key={fragment.id} position={[fragment.at[0], 0, fragment.at[2]]}>
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
    </group>;
  })}</>;
}
/** Lift cages, with where they go and whether the cage code is known. */
function Lifts({ place, world, crawler }: { place: Place; world: WorldModel; crawler: boolean }) {
  return <>{LIFTS.filter(lift => lift.place === place).map(lift => {
    const to = STRATA[lift.to], up = to.pressure < (place === "home" ? 0 : STRATA[place].pressure);
    const locked = !up && ((lift.to === "wells" && world.fact("story.signal") !== true) || (lift.to === "choir" && world.fact("story.relay") !== true));
    const color = locked ? C.danger : up ? C.cyan : C.amber;
    return <group key={lift.id} position={[lift.at[0], 0, lift.at[2]]}>
      {[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].map(([x, z]) => <IndustrialBox key={`${x}${z}`} at={[x!, 1.6, z!]} size={[0.12, 3.2, 0.12]} color={C.steel} surface="steel" />)}
      <IndustrialBox at={[0, 0.04, 0]} size={[2.3, 0.08, 2.3]} color="#2b3133" surface="rubber" />
      <IndustrialBox at={[0, 3.2, 0]} size={[2.4, 0.14, 2.4]} color={C.steel} surface="steel" />
      <IndustrialBox at={[0, 0.1, 0]} size={[1.6, 0.03, 0.1]} color={color} emission={0.9} />
      <Sign at={[0, 2.6, 1.2]} title={up && crawler ? "CRAWLER / HOME" : `${up ? "UP" : "DOWN"} · ${to.numeral} ${to.name.toUpperCase()}`} sub={locked ? "CAGE CODE REQUIRED" : `${to.metres} M / PRESSURE ${to.pressure}`} color={color} />
      <Sign at={[0, 2.6, -1.2]} title={up && crawler ? "CRAWLER / HOME" : `${up ? "UP" : "DOWN"} · ${to.numeral} ${to.name.toUpperCase()}`} sub={locked ? "CAGE CODE REQUIRED" : `${to.metres} M / PRESSURE ${to.pressure}`} color={color} turn={Math.PI} />
    </group>;
  })}</>;
}
function Hazards({ place }: { place: Place }) {
  return <>{HAZARDS.filter(hazard => hazard.place === place && hazard.hazard !== "steam").map(hazard =>
    <mesh key={hazard.id} position={[hazard.x, 0.02, hazard.z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[hazard.w, hazard.d]} />
      {hazard.hazard === "frost"
        ? <meshStandardMaterial color="#cfe8ff" roughness={0.15} metalness={0.1} transparent opacity={0.75} emissive="#4f7fa8" emissiveIntensity={0.25} />
        : <meshStandardMaterial color="#2a0f3a" roughness={0.05} metalness={0.3} emissive="#6a2bb0" emissiveIntensity={0.35} />}
    </mesh>)}</>;
}
function PrinterZero({ taken }: { taken: boolean }) {
  return <group position={[PRINTER_ZERO[0], 0, PRINTER_ZERO[2]]}>
    <IndustrialBox at={[0, 1.1, 0]} size={[4.2, 2.2, 2.4]} color="#3a2426" />
    <IndustrialBox at={[0, 2.8, -0.4]} size={[3.6, 1.2, 1.4]} color={C.steel} surface="steel" />
    <IndustrialBox at={[0, 1.3, 1.22]} size={[2.4, 0.6, 0.04]} color={taken ? C.panel : C.danger} emission={taken ? 0.1 : 1.3} />
    {[-1.6, 1.6].map(x => <IndustrialCylinder key={x} at={[x, 2.4, 0.6]} radius={0.22} length={4.8} color={C.ink} />)}
    {!taken && <pointLight position={[0, 2, 2]} color={C.danger} intensity={9} distance={9} />}
    <Sign at={[0, 4.1, 0.3]} title="PRINTER ZERO" sub={taken ? "PATTERN COPIED" : "PATTERN 406 / ORIGINAL"} color={C.danger} width={3.2} />
  </group>;
}
/** A creature's body: a pale crawling hand, a long-legged courier, the Overrun's armoured hulk. */
function CreatureModel({ creature }: { creature: Creature }) {
  const def = SPECIES[creature.species], winding = creature.mode === "winding";
  const hunting = winding || creature.mode === "attack" || creature.mode === "stalk";
  const eye = hunting ? C.danger : creature.mode === "flee" ? "#7fc6ff" : C.amber;
  const lift = winding ? 0.25 : 0;
  return <group position={[creature.at[0], 0, creature.at[2]]} rotation-y={creature.facing}>
    {creature.species === "hand" ? <>
      <mesh position={[0, 0.2, 0]} scale={[1, 0.45, 1.2]}><sphereGeometry args={[0.3, 14, 10]} /><meshStandardMaterial color="#d8c8b4" roughness={0.7} /></mesh>
      {[-0.24, -0.12, 0, 0.12, 0.24].map((x, i) => <IndustrialCylinder key={i} at={[x, 0.12, 0.38 + (i === 2 ? 0.06 : 0)]} turn={[Math.PI / 2 - 0.3, 0, 0]} radius={0.04} length={0.36} color="#cdb9a2" surface="printed" />)}
    </> : creature.species === "courier" ? <>
      {[-0.18, 0.18].map(x => <IndustrialCylinder key={x} at={[x, 0.6, 0]} radius={0.07} length={1.2} color="#5a5f63" surface="printed" />)}
      <IndustrialCylinder at={[0, 1.45 + lift, 0]} turn={[0.35, 0, 0]} radius={0.22} length={0.9} color="#6d7378" surface="printed" />
      <mesh position={[0, 2.0 + lift, 0.25]}><sphereGeometry args={[0.18, 12, 10]} /><meshStandardMaterial color="#4a4f52" roughness={0.6} /></mesh>
      <Glow at={[0.07, 2.04 + lift, 0.41]} radius={0.035} color={eye} /><Glow at={[-0.07, 2.04 + lift, 0.41]} radius={0.035} color={eye} />
      {[-0.32, 0.32].map(x => <IndustrialCylinder key={x} at={[x, 1.35 + lift, 0.25]} turn={[winding ? -1.2 : 0.6, 0, 0]} radius={0.05} length={0.9} color="#5a5f63" surface="printed" />)}
    </> : <>
      <IndustrialBox at={[0, 1.6 + lift, 0]} size={[2.8, 2.4, 3.6]} color="#4a3c33" surface="steel" />
      <IndustrialBox at={[0, 3.0 + lift, -0.3]} size={[2.2, 0.6, 2.8]} color="#6b5a48" surface="steel" />
      <IndustrialBox at={[0, 1.9 + lift, 2.0]} size={[1.8, 1.0, 0.6]} color="#3b302a" surface="steel" />
      {[-1.25, 1.25].map(x => [-1.2, 1.2].map(z => <IndustrialCylinder key={`${x}${z}`} at={[x, 0.45, z]} radius={0.35} length={0.9} color="#2b2522" surface="rubber" />))}
      {[-0.5, 0, 0.5].map(x => <Glow key={x} at={[x, 2.05 + lift, 2.32]} radius={0.12} color={eye} />)}
      {hunting && <pointLight position={[0, 2.8, 4.6]} color={C.danger} intensity={2} distance={5} />}
    </>}
    {creature.health < def.health && <IndustrialBox at={[0, def.size * 2.4 + 0.4, 0]} size={[0.8 * Math.max(0.05, creature.health / def.health), 0.06, 0.06]} color={C.danger} emission={0.9} />}
  </group>;
}
function Lures({ dive }: { dive: Dive }) {
  return <>{dive.thrown.map(lure => <group key={lure.id} position={[lure.at[0], 0, lure.at[2]]}>
    <IndustrialCylinder at={[0, 0.1, 0]} radius={0.09} length={0.2} color={C.danger} emission={0.9} />
    <mesh position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.6, 20]} /><meshBasicMaterial color="#6e1010" transparent opacity={0.7} /></mesh>
  </group>)}</>;
}
/** Everything that belongs to the floor the diver stands on below receiving, plus receiving's own lift. */
export function StratumDressing({ dive, deep, world }: { dive: Dive; deep: Deep; world: WorldModel }) {
  const place = dive.stratum;
  return <>
    <Lifts place={place} world={world} crawler={deep.gear.includes("crawler")} />
    <Nodes place={place} dive={dive} />
    <Supplies place={place} dive={dive} />
    <Fragments place={place} deep={deep} />
    <Hazards place={place} />
    {place === "choir" && <PrinterZero taken={world.fact("story.zero") === true} />}
    {Object.values(dive.fauna).filter(creature => creature.place === place && creature.health > 0).map(creature => <CreatureModel key={creature.id} creature={creature} />)}
    <Lures dive={dive} />
  </>;
}
const MODULE_LOOK: Record<string, { color: string; build: (ready: boolean) => React.ReactNode }> = {
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
    <group position={[FABRICATOR[0], 0, FABRICATOR[2]]}>
      <IndustrialBox at={[0, 0.6, 0]} size={[1.8, 1.2, 1.1]} color={C.steel} surface="steel" />
      <IndustrialBox at={[0, 1.55, -0.3]} size={[1.6, 0.7, 0.4]} color={C.panel} />
      <IndustrialBox at={[0, 1.55, -0.09]} size={[1.2, 0.45, 0.02]} color={C.cyan} emission={0.9} />
      <IndustrialCylinder at={[0, 1.25, 0.15]} radius={0.08} length={0.4} color={C.ink} />
      <Sign at={[0, 2.5, -0.3]} title="FABRICATOR" sub="BLUEPRINTS / BAYS" color={C.cyan} width={2.2} />
    </group>
    {BAYS.map((bay, index) => {
      const built = instances.find(instance => instance.slot === bay.id) ?? null;
      const look = built === null ? null : MODULE_LOOK[built.kind];
      const running = built !== null && built.ready && power >= 0;
      return <group key={bay.id} position={[bay.at[0], 0, bay.at[2]]} rotation-y={bay.turn}>
        <IndustrialBox at={[0, 0.015, 0]} size={[1.9, 0.03, 1.9]} color={built === null ? "#2b3133" : "#3a4448"} surface="rubber" />
        {[-0.95, 0.95].map(x => <IndustrialBox key={x} at={[x, 0.035, 0]} size={[0.06, 0.02, 1.9]} color={C.amber} emission={0.4} />)}
        {look !== null && <group scale={built!.ready ? 1 : [1, 0.5, 1]}>{look.build(running)}</group>}
        {built !== null && !built.ready && [-0.8, 0.8].map(x => <IndustrialBox key={x} at={[x, 1, 0.8]} size={[0.06, 2, 0.06]} color={C.amber} />)}
        <Sign at={[0, 2.3, -0.9]} title={built === null ? `BAY ${index + 1}` : built.label.toUpperCase()} sub={built === null ? "EMPTY / BUILD AT FABRICATOR" : !built.ready ? "BUILDING" : running ? "RUNNING" : "NO POWER"} color={built === null ? C.panel : running ? (look?.color ?? C.cyan) : C.danger} width={1.8} />
      </group>;
    })}
  </>;
}
/**
 * Each floor's air: fog closes in and the ambient light drops the deeper you go. The shell owns the
 * lights and fog; this only retunes them when the floor changes.
 */
const STRATA_FILL = 0.45;
export function StratumAtmosphere({ place }: { place: Place }) {
  const { scene } = useThree();
  useEffect(() => {
    const fog = place === "home" ? { color: C.black, near: 24, far: 75 } : STRATA[place].fog;
    // Below Marrow the fill drops by half again, so the lamps, not the ambient, shape each room.
    const ambient = place === "home" ? 1 : STRATA[place].ambient / STRATA.vault.ambient * STRATA_FILL;
    if (scene.fog instanceof Fog) { scene.fog.color.set(fog.color); scene.fog.near = fog.near; scene.fog.far = fog.far; }
    if (scene.background instanceof Color) scene.background.set(place === "home" || place === "vault" ? C.black : fog.color);
    scene.traverse((object: Object3D) => {
      if (!(object instanceof AmbientLight) && !(object instanceof HemisphereLight)) return;
      const base = (object.userData.deepwardBase as number | undefined) ?? object.intensity;
      object.userData.deepwardBase = base;
      object.intensity = base * ambient;
    });
  }, [place, scene]);
  return null;
}
/** The headlamp: a spot on the camera. Always mounted so switching it never recompiles a shader. */
export function Headlamp({ on }: { on: boolean }) {
  const ref = useRef<SpotLight>(null);
  const { scene } = useThree();
  useEffect(() => { const light = ref.current; if (light === null) return; light.userData.haze = false; scene.add(light.target); return () => { scene.remove(light.target); }; }, [scene]);
  useFrame(({ camera }) => {
    const light = ref.current;
    if (light === null) return;
    // Carried a little behind the eye with a gentle falloff, so a wall at arm's length is lit, not
    // blown to white, while the beam still reaches down an aisle.
    camera.getWorldDirection(light.target.position);
    light.position.copy(light.target.position).multiplyScalar(-0.7).add(camera.position);
    light.target.position.multiplyScalar(6).add(camera.position);
    light.intensity = on ? 5 : 0;
  });
  return <spotLight ref={ref} color="#fff1d6" angle={0.55} penumbra={0.55} distance={22} decay={0.8} intensity={0} />;
}
