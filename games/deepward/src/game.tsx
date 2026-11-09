import "./style.css";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useSceneSwap } from "@jgengine/core/render/sceneSwap.draw";
import { Group, SpotLight, Vector3, type PointLight } from "three";
import { stationAssets } from "./game/assets";
import { StationModels, hasStationModel } from "./game/stationModels";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { defineGame } from "@jgengine/shell/defineGame";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { useGameStore } from "@jgengine/react/hooks";
import { groundDistance, GARAGE, EXIT, PROPS, PRINT_ID, PRINTER_ZERO, SALVAGE, STEAM, STASH, walkable, world, physics, editorLayers, ROOMS, RETURN_SPINE, DECOR, decorPoint, type Place, type Point } from "./world";
import { hazardsAt } from "./game/descent";
import { marrowOf, marrowSpec } from "./game/marrow";
import { STRATA } from "./game/strata";
import { ALARM_LAMPS, alarmCreatures, alarmLampAt, Headlamp, MarrowBays, StratumAtmosphere, StratumDressing, StratumLife, type StratumMarks } from "./game/strataArt";
import { PALETTE as C, signTexture, IndustrialBox, SALVAGE_PLACARD, type Triple } from "./game/art";
import { surfaceMaterial, type IndustrialSurface } from "./game/industrialMaterials";
import { FITTER_FLASH, FitterModel, fitterHit } from "./game/fitterArt";
import { ServiceWeapon, serviceWeaponBody, serviceWeaponPose } from "./game/weaponArt";
import { activeRoomLamps, deriveRoomPresentation, isBayWall, lampFlicker, ROOM_LIGHT_BUDGET, ROOM_LIGHT_REACH, ROOM_LIGHT_INTENSITY } from "./game/roomPresentation";
import { captureProbe, initialize, keybinds, seatPlayer, setAim, tickControls, viewStore, type View } from "./game/controls";
import { registerCaptureCommands } from "./game/capture";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { ITEMS, type Dive } from "./game/state";
import { StationStructure, StationBatch } from "./game/stationArt";
import { ModularArchitecture } from "./game/modularArt";
import { StencilDecals } from "./game/stencilDecals";
import { DamagedMachinery } from "./game/damagedMachinery";
import { FloorPracticals, InteriorArt } from "./game/interiorArt";
import { ShiftLocker } from "./game/fixtureArt";
import { GameUI } from "./game/ui/GameUI";
import { shiftTheme } from "./game/ui/ItemMark";
import { deepwardKit } from "./game/ui/menu/deepwardKit";
import { audio } from "./game/audio";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

function Block({ at, size, color = C.panel, glow = false, surface }: { at: Triple; size: Triple; color?: string; glow?: boolean; surface?: IndustrialSurface }) {
  return <IndustrialBox at={at} size={size} color={color} surface={surface ?? (glow ? "lamp" : color === C.steel ? "steel" : color === C.brass ? "brass" : "paint")} emission={glow ? 0.8 : 0} />;
}
function Sign({ at, title, sub, color = C.cyan, turn = 0, width = 3.8 }: { at: Triple; title: string; sub: string; color?: string; turn?: number; width?: number }) {
  const texture = useMemo(() => signTexture(title, sub, color), [title, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={at} rotation-y={turn}><planeGeometry args={[width, width / 3]} /><meshBasicMaterial map={texture} /></mesh>;
}
function Tube({ at, radius = 0.18, height = 1, color = C.steel }: { at: Triple; radius?: number; height?: number; color?: string }) {
  return <mesh position={at} castShadow><cylinderGeometry args={[radius, radius, height, 12]} /><meshStandardMaterial {...surfaceMaterial(color === C.steel ? "steel" : color === C.brass ? "brass" : "paint", color)} /></mesh>;
}
function RailCart({ at, home = false }: { at: Triple; home?: boolean }) {
  return <group position={at}>
    {!hasStationModel(home ? "home" : "vault", home ? "rail-garage" : "rail-extraction") && <>
    <Block at={[0, 0.24, 0]} size={[2.5, 0.48, 1.8]} color={C.steel} />
    <Block at={[0, 0.65, 0.65]} size={[2.3, 0.65, 0.18]} color={C.wall} />
    <Block at={[-0.95, 0.7, -0.2]} size={[0.2, 0.9, 1.35]} color={C.brass} />
    <Block at={[0.95, 0.7, -0.2]} size={[0.2, 0.9, 1.35]} color={C.brass} />
    <Block at={[0, 0.51, 0]} size={[1.4, 0.08, 0.12]} color={C.cyan} glow />
    </>}
    {!hasStationModel(home ? "home" : "vault", home ? "rail-garage" : "rail-extraction") && <Sign at={[0, 3.04, 0.9]} title={home ? "THE GARAGE" : "RETURN TO MARROW"} sub={home ? "BELLWETHER / LINE 06" : "THE WAY OUT IS THE WAY IN"} width={2.65} turn={home ? 0 : Math.PI} />}
  </group>;
}
/** The room shell and its trim in the station's own finish; `shell={false}` keeps only the signs and floor guides. */
function Architecture({ place, shell = true }: { place: Place; shell?: boolean }) {
  const plan = useMemo(() => deriveRoomPresentation(place), [place]);
  const batches = useMemo(() => {
    if (!shell) return [];
    const groups = new Map<string, (typeof editorLayers.volumes)[number][]>();
    const part = (id: string, at: Triple, size: Triple, color: string, surface: IndustrialSurface = "paint") => {
      const key = `${surface}:${color}`, list = groups.get(key) ?? [];
      list.push({ id, kind: "derived-room-surface", shape: "box", center: { x: at[0], y: at[1], z: at[2] }, halfExtents: { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 }, color, meta: { surface } });
      groups.set(key, list);
    };
    for (const s of plan.surfaces) {
      if (isBayWall(s)) continue;
      part(s.id, s.at, s.size, s.kind === "floor" ? "#4b5c61" : s.kind === "ceiling" ? C.panel : C.panel, s.kind === "floor" ? "floor" : "paint");
      if (s.kind !== "wall") continue;
      part(`${s.id}:base`, [s.at[0],s.at[1]-s.size[1]/2+0.14,s.at[2]], [s.size[0]+0.02,0.18,s.size[2]+0.02], C.steel, "steel");
      part(`${s.id}:stripe`, [s.at[0],s.at[1]+0.46,s.at[2]], [s.size[0]+0.025,0.065,s.size[2]+0.025], C.brass, "brass");
      const alongX = s.axis === "x", length = alongX ? s.size[0] : s.size[2], bays = Math.max(1, Math.ceil(length / 3));
      for (let i = 0; i <= bays; i++) {
        const offset=-length/2+i*length/bays;
        part(`${s.id}:seam:${i}`, [s.at[0]+(alongX?offset:0),s.at[1],s.at[2]+(alongX?0:offset)], alongX?[0.07,s.size[1],s.size[2]+0.025]:[s.size[0]+0.025,s.size[1],0.07], C.panel);
      }
    }
    for(const l of plan.lamps) {
      part(`${l.id}:housing`, [l.fixture[0],l.fixture[1]+0.05,l.fixture[2]], [l.width+0.16,0.1,0.32],C.steel,"steel");
      part(`${l.id}:light`, [l.fixture[0],l.fixture[1]-0.02,l.fixture[2]], [l.width,0.045,0.2],place==="home"?C.amber:place==="vault"?C.cyan:STRATA[place].lamp.color,"lamp");
    }
    return [...groups.entries()];
  },[plan,place,shell]);
  return <group>
    {batches.map(([id,parts])=><StationBatch key={id} parts={parts} />)}
    {place === "vault" && <>
      {[-1, 1].map(side => <Block key={side} at={[RETURN_SPINE!.x + side * RETURN_SPINE!.w * 0.27, 0.006, RETURN_SPINE!.z]} size={[0.075, 0.022, RETURN_SPINE!.d]} color={C.brass} glow />)}
      {ROOMS.filter(room => room.place === "vault" && room.id !== "room-return-spine").map(room => <group key={room.id} position={[room.x, 0, room.z + room.d / 2 - 1]}>
        <Sign at={[0, 3.15, 0.15]} title={room.name.toUpperCase()} sub="RETURN RAIL  ↑  /  MARROW" width={Math.min(3.6, room.w - 1)} />
      </group>)}
    </>}
  </group>;
}
/** How much brighter a ceiling spot burns than the old all-round bulb: the light it no longer spends on the ceiling. */
const ROOM_SPOT_GAIN = 1.3;
/**
 * Fixed pool selected on the render frame; no timers, actor hiding, or graphics-profile changes. Each
 * lamp is a downward spot, so it leaves a pool on the floor, dark corners between pools, and a beam in
 * the haze; the dock's work lights are near-hemispheres.
 */
/** The floor the station is drawn for: Marrow at home, else the stratum the dive is on. */
const placeOf = (view: View): Place => view.mode === "home" || view.dive === null ? "home" : view.dive.stratum;
function RoomLights() {
  const place = useStore(viewStore, placeOf);
  const lamps = useMemo(() => deriveRoomPresentation(place).lamps, [place]);
  const lights = useMemo(() => Array.from({ length: ROOM_LIGHT_BUDGET }, () => {
    const light = new SpotLight(place === "home" ? "#f3c390" : STRATA[place].lamp.color, 0, place === "home" ? ROOM_LIGHT_REACH : STRATA[place].lamp.reach, place === "home" ? 1.45 : 1.3, 0.8, 2);
    light.add(light.target);
    light.target.position.set(0, -4, 0);
    return light;
  }), [place]);
  const flicker = place === "home" ? 0 : STRATA[place].lamp.flicker;
  useFrameTask(({ camera, clock }) => {
    const closest = activeRoomLamps(lamps, [camera.position.x, camera.position.y, camera.position.z]);
    lights.forEach((light, i) => {
      const candidate = closest[i];
      light.intensity = candidate ? ROOM_LIGHT_INTENSITY[place] * ROOM_SPOT_GAIN * lampFlicker(candidate.id, clock.elapsedTime, flicker) : 0;
      if (candidate) light.position.set(...candidate.light);
    });
  });
  return <>{lights.map((light, i) => <primitive key={i} object={light} />)}</>;
}
function SalvageModel({ kind, empty }: { kind: keyof typeof ITEMS; empty: boolean }) {
  const color = empty ? C.panel : ITEMS[kind].color;
  return <group>
    <Block at={[0, 0.35, 0]} size={[0.95, 0.65, 0.7]} color={C.steel} />
    <Block at={[0, 0.72, -0.2]} size={[0.98, 0.12, 0.78]} color={C.panel} />
    <Block at={[0, 0.58, 0.365]} size={[0.72, 0.11, 0.04]} color={color} glow={!empty} />
    {!empty && (kind === "wire" ? <mesh position={[0, 0.95, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.22, 0.085, 8, 16]} /><meshStandardMaterial color={color} metalness={0.6} /></mesh>
      : <Tube at={[0, 0.95, 0]} radius={kind === "ink" ? 0.22 : 0.14} height={0.38} color={color} />)}
  </group>;
}
function SalvagePlacard({ id, kind }: { id: string; kind: keyof typeof ITEMS }) {
  const { face, backing, supports } = SALVAGE_PLACARD;
  return <group>
    {supports.map(part => <Block key={part.at[0]} at={part.at} size={part.size} color={C.steel} />)}
    <Block at={backing.at} size={backing.size} color={C.panel} />
    <Sign at={face.at} title={id.toUpperCase()} sub={id === "ink" ? "PRINTER RESERVE" : "SHIFT SUPPLIES"} width={face.width} color={ITEMS[kind].color} />
  </group>;
}
function renderEntity(entity: SceneEntity): ReactNode {
  return entity.id === PRINT_ID ? <PrintPresentation /> : <group />;
}
/** The Fitter's model, re-rendered when its clip changes, not as it walks: the entity moves it. */
function PrintPresentation() {
  const pose = useStore(viewStore, view => {
    const print = view.dive?.print;
    return print === undefined || print.health <= 0 ? null : { mode: print.mode, attack: print.mode === "winding" ? print.attack : 0 };
  });
  return pose === null ? null : <FitterModel print={pose} />;
}
/**
 * Every local light the station can show besides the room lamps and the headlamp, mounted in every
 * place and dark where it does not apply: the floor's wall lamps, the crawlers' alarm pair, Printer
 * Zero's lamp, the vent's glow and the Fitter's hit flash. three.js recompiles every lit material
 * when the scene's light counts change, so a dive, a lift or the Fitter arriving only moves,
 * recolours or dims these.
 */
function StationLights({ place }: { place: Place }) {
  return <>
    <FloorPracticals place={place} />
    <AlarmLamps />
    <ZeroLamp place={place} />
    <VentGlow />
    <FitterFlash />
  </>;
}
/** The hunting crawlers' alarm lamps, moved on the render frame so a crawler's step re-renders nothing. */
function AlarmLamps() {
  const ctx = useGameContext();
  const lamps = useRef<(PointLight | null)[]>([]);
  useFrameTask(() => {
    const dive = viewStore.read(ctx).dive;
    const alarms = dive === null ? [] : alarmCreatures(dive.fauna, dive.stratum);
    lamps.current.forEach((light, index) => {
      const creature = alarms[index];
      if (light === null) return;
      light.intensity = creature === undefined ? 0 : 2;
      if (creature !== undefined) light.position.set(...alarmLampAt(creature));
    });
  });
  return <>{Array.from({ length: ALARM_LAMPS }, (_, index) =>
    <pointLight key={index} ref={light => { lamps.current[index] = light; }} position={[0, -50, 0]} color={C.danger} intensity={0} distance={5} />)}</>;
}
/** Printer Zero's red lamp in the choir, dark once its pattern is copied. */
function ZeroLamp({ place }: { place: Place }) {
  const lit = useGameStore(ctx => place === "choir" && marrowOf(ctx).fact("story.zero") !== true);
  return <pointLight position={[PRINTER_ZERO[0], 2, PRINTER_ZERO[2] + 2]} color={C.danger} intensity={lit ? 9 : 0} distance={9} />;
}
/** The steam vent's glow in the vault while it vents. */
function VentGlow() {
  const on = useStore(viewStore, view => view.dive !== null && view.dive.stratum === "vault" && view.dive.elapsed % 8 < 3);
  return <pointLight position={[STEAM.x, 1, STEAM.z]} color={C.danger} intensity={on ? 12 : 0} distance={7} />;
}
/** The Fitter's red hit flash, on its chest from the entity's pose, burning while the last shot struck it. */
function FitterFlash() {
  const ctx = useGameContext();
  const ref = useRef<PointLight>(null);
  useFrameTask(() => {
    const light = ref.current;
    if (light === null) return;
    const view = viewStore.read(ctx), print = view.dive?.print, entity = ctx.scene.entity.get(PRINT_ID);
    const hit = print !== undefined && entity != null && fitterHit(print, view.trace);
    light.intensity = hit ? FITTER_FLASH.intensity : 0;
    if (entity == null) return;
    const [x, y, z] = entity.position, yaw = entity.rotationY;
    light.position.set(x + Math.sin(yaw) * FITTER_FLASH.ahead, y + FITTER_FLASH.up, z + Math.cos(yaw) * FITTER_FLASH.ahead);
  });
  return <pointLight ref={ref} color={FITTER_FLASH.color} intensity={0} distance={FITTER_FLASH.distance} />;
}
function Tracer({ from, to }: { from: Point; to: Point }) {
  const midpoint = new Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  const direction = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = direction.length();
  const ref = useRef<Group>(null);
  useEffect(() => { ref.current?.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()); }, [from, to]);
  return <group ref={ref} position={midpoint}><mesh><cylinderGeometry args={[0.018, 0.018, length, 6]} /><meshBasicMaterial color={C.amber} /></mesh></group>;
}
function Hand() {
  const ctx = useGameContext(), ref = useRef<Group>(null);
  // The weapon redraws when it is drawn, swapped or flashes; reload, hurt and recoil move it every frame without a render.
  const view = useStore(viewStore, v => ({ mode: v.mode, hand: v.dive?.hand ?? null, flash: (v.dive?.flash ?? 0) > 0 }));
  const posed = useRef<Group>(null), body = useRef<Group>(null);
  const dir = useMemo(() => new Vector3(), []);
  const applyPose = () => {
    const v = viewStore.read(ctx);
    if (v.dive === null) return;
    const pose = serviceWeaponPose({ hand: v.dive.hand, reload: v.ammo?.reloadProgress ?? 0, hurt: v.dive.hurt, flash: v.dive.flash });
    posed.current?.position.set(...pose.at);
    posed.current?.rotation.set(...pose.turn);
    body.current?.position.set(...serviceWeaponBody(pose));
  };
  useLayoutEffect(applyPose);
  useFrameTask(({ camera }) => {
    camera.getWorldDirection(dir);
    setAim(ctx, [dir.x, dir.y, dir.z]);
    const hand = ref.current;
    if (hand === null) return;
    hand.position.copy(camera.position); hand.quaternion.copy(camera.quaternion);
    hand.translateX(0.26); hand.translateY(-0.26); hand.translateZ(-0.55);
    applyPose();
  });
  return <group ref={ref} visible={view.mode === "dive"}>
    {view.hand !== null && <group ref={posed}><ServiceWeapon kind={view.hand} shadows="none" flash={view.flash} body={body} /></group>}
  </group>;
}
/** The floor's fixed dressing, re-rendered only when something on it is worked, taken or scanned. */
function FloorDressing({ place }: { place: Place }) {
  const marks = useGameStore((ctx): StratumMarks => {
    const view = viewStore.read(ctx), world = marrowOf(ctx);
    return {
      crawler: view.deep.gear.includes("crawler"),
      harvested: view.dive?.harvested ?? NO_HARVEST,
      collected: view.dive?.collected ?? NONE,
      scanned: view.deep.scanned,
      zeroTaken: world.fact("story.zero") === true,
      signal: world.fact("story.signal") === true,
      relay: world.fact("story.relay") === true,
    };
  });
  return <StratumDressing place={place} marks={marks} />;
}
/**
 * The floor's creatures and lures: re-rendered when one arrives, dies, lands or burns out. Each
 * creature moves itself on the render frame; a lure stays where it landed.
 */
function FloorLife({ place }: { place: Place }) {
  const ctx = useGameContext();
  const living = useStore(viewStore, view => Object.values(view.dive?.fauna ?? NO_FAUNA).filter(creature => creature.place === place && creature.health > 0).map(creature => creature.id).join("\n"));
  useStore(viewStore, view => (view.dive?.thrown ?? NO_LURES).map(lure => lure.id).join("\n"));
  const read = useCallback((id: string) => viewStore.read(ctx).dive?.fauna[id], [ctx]);
  const creatures = useMemo(() => living === "" ? [] : living.split("\n"), [living]);
  return <StratumLife creatures={creatures} read={read} thrown={viewStore.read(ctx).dive?.thrown ?? NO_LURES} />;
}
/** Marrow's bays, re-rendered when one is built, finishes or loses power. */
function Bays() {
  const ctx = useGameContext();
  useGameStore(state => {
    const world = marrowOf(state);
    return `${world.num("marrow.power") >= 0}|${world.instances().map(instance => `${instance.slot}:${instance.kind}:${instance.ready}:${instance.label}`).join()}`;
  });
  return <MarrowBays world={marrowOf(ctx)} />;
}
/** The steam vent in the vault: it vents three seconds in every eight. Its glow is {@link VentGlow}. */
function SteamVent() {
  const on = useStore(viewStore, view => view.dive !== null && view.dive.elapsed % 8 < 3);
  return <group position={[STEAM.x, 0, STEAM.z]}>
    <Block at={[0, 0.018, 0]} size={[STEAM.w, 0.025, STEAM.d]} color="#554437" />
    {Array.from({ length: 9 }, (_, i) => <Block key={i} at={[0, 0.04, -3 + i * 0.7]} size={[STEAM.w, 0.025, 0.17]} color={C.amber} />)}
    <Tube at={[1.6, 1.9, 0]} radius={0.14} height={3.8} />
    <Sign at={[0, 2.7, -3.8]} title="HOT SUPPRESSANT" sub={on ? "VENTING / KEEP CLEAR" : "PRESSURE LOW / CROSS NOW"} color={C.danger} width={3.5} />
    {on && [-1, 0, 1].map(x => <mesh key={x} position={[x, 1.1, 0]}><cylinderGeometry args={[0.7, 0.25, 2.1, 10]} /><meshBasicMaterial color="#dec9b6" transparent opacity={0.16} depthWrite={false} /></mesh>)}
  </group>;
}
const NO_HARVEST: Dive["harvested"] = {};
const NONE: string[] = [];
const NO_FAUNA: Dive["fauna"] = {};
const NO_LURES: Dive["thrown"] = [];
/**
 * A floor's fixed build: shell, structure, station models, machinery and decals. Memoized on the
 * place, so it is built once per floor, in the background while the travel card is up.
 */
const FloorBuild = memo(function FloorBuild({ place }: { place: Place }) {
  return <>
    {place === "home" ? <><Architecture place={place} /><StationStructure place={place} /></> : <><InteriorArt stratum={place} /><Architecture place={place} shell={false} /></>}
    <StationModels place={place} assets={stationAssets} /><ModularArchitecture place={place} /><DamagedMachinery place={place} /><StencilDecals place={place} />
  </>;
});
function WorldOverlay() {
  // Only what the station's layout shows; the parts that move each tick subscribe on their own.
  const view = useStore(viewStore, v => ({
    place: v.dive === null ? "home" as Place : v.dive.stratum,
    lamp: v.dive?.lamp === true,
    stash: v.home.stash.length,
    life: v.home.life,
    collected: v.dive?.collected ?? NONE,
    drop: v.dive?.print.drop ?? null,
  }));
  // A dive, a lift or the rail home builds the next floor under the travel card, never in a frozen frame.
  const place = useSceneSwap(view.place), diving = place !== "home";
  return <>
    <SceneCaptureBinding />
    <StratumAtmosphere place={place} /><Headlamp on={view.lamp} />
    <FloorBuild place={place} />
    <RoomLights /><StationLights place={place} />
    {!diving && <Bays />}
    {diving && <><FloorDressing place={place} /><FloorLife place={place} /></>}
    {editorLayers.markers.filter(m => m.kind === "deepward-station-sign" && m.meta?.["place"] === place).map(m => <Sign key={m.id} at={[m.position.x,m.position.y,m.position.z]} title={m.label ?? m.id} sub={String(m.meta?.["subtitle"] ?? "")} width={Number(m.meta?.["width"] ?? 2.6)} turn={m.rotationY ?? 0} color={C.amber} />)}
    <group visible={!diving}>
    <RailCart at={[GARAGE[0], GARAGE[1], GARAGE[2] - 0.7]} home />

    <group position={[STASH[0] - 0.4, 0, STASH[2]]}>
      {!hasStationModel("home", "stash-marrow") && <>
      <Block at={[0, 0.65, 0]} size={[1.7, 1.3, 1.3]} color={C.wall} />
      <Block at={[0.86, 0.82, 0]} size={[0.04, 0.15, 0.9]} color={C.cyan} glow />
      </>}
      <Sign at={[0, 2.5, 0.7]} title="MARROW / STASH" sub={`${view.stash} ITEMS / SAVED AT HOME`} width={3.4} />
    </group>
    {!hasStationModel("home", "decor-home-printer") && <group position={decorPoint("decor-home-printer")}>
      <Block at={[0, 0.4, 0]} size={[2.6, 0.75, 1.5]} color={C.steel} />
      <Block at={[0, 1.1, -0.6]} size={[2.6, 1.5, 0.2]} color={C.wall} />
      <Sign at={[0, 2.5, -0.45]} title="THE PRINTER" sub={`HALLOWAY / LIFE ${view.life}`} color={C.amber} width={3} />
      <Tube at={[-0.85, 1.6, -0.4]} height={0.7} color={C.ink} />
    </group>
    }
    <Sign at={decorPoint("sign-marrow")} title="MARROW" sub="ONE OF THE LAST LIT VAULTS" color={C.amber} turn={Math.PI} width={5.5} />
    </group><group visible={place === "vault"}>
    <RailCart at={[EXIT[0], EXIT[1], EXIT[2] + 0.5]} />
    {DECOR.filter(entry => entry.id.startsWith("locker-shift-")).map(entry => <group key={entry.id} position={[entry.position.x, entry.position.y, entry.position.z]}>
      <ShiftLocker ajar={entry.id.endsWith("2") ? 0.35 : 0} />
      <Sign at={[0, 1.6, 0.37]} title={String(entry.meta?.["number"] ?? entry.label)} sub={String(entry.meta?.["name"] ?? "SHIFT CREW")} width={0.65} />
    </group>)}
    <Sign at={decorPoint("sign-shift")} title="SHIFT 406" sub="REPORT TO YOUR POST" color={C.amber} />
    {SALVAGE.map(s => <group key={s.id} position={[s.at[0], 0, s.at[2]]}>
      <SalvageModel kind={s.kind} empty={view.collected.includes(s.id)} />
      <SalvagePlacard id={s.id} kind={s.kind} />
    </group>)}
    {PROPS.filter(p => !hasStationModel("vault", p.id)).map((p, i) => <group key={i} position={[p.x, 0, p.z]}>
      <Block at={[0, 0.7, 0]} size={[p.w, 1.4, p.d]} color={C.wall} />
      <Tube at={[0, 1.9, 0]} radius={0.5} height={1.3} />
      <Block at={[0, 1.1, p.d / 2 + 0.02]} size={[p.w * 0.6, 0.1, 0.05]} color={i === 2 ? C.ink : C.cyan} glow />
    </group>)}
    <Sign at={decorPoint("sign-printer")} title="PRINTER 06" sub="PATTERN: FITTER / COPY 406" color={C.ink} />
    <SteamVent />
    </group>
    {view.drop !== null && place === "vault" && !view.collected.includes("fitter") && <group position={[view.drop[0], view.drop[1] + 0.1, view.drop[2]]} rotation={[0, Math.PI / 2, Math.PI / 2]} scale={1.35}>
      <ServiceWeapon kind="service-rifle" />
    </group>}
    <ShotTrace />
    <Hand />
  </>;
}
/** The last shot's tracer, while it shows. */
function ShotTrace() {
  const trace = useStore(viewStore, view => view.trace === null ? null : { from: view.trace.from, to: view.trace.to });
  return trace === null ? null : <Tracer from={trace.from} to={trace.to} />;
}
const content: GameContextContent = {
  entityById(id): GameContextEntityEntry | null {
    if (id === "diver") return { stats: { health: { max: 100, min: 0 }, oxygen: { max: 110 }, ammo: { max: 6 } }, movement: { poses: ["standing", "running"], walkSpeed: 4.4 } };
    if (id === "fitter") return { stats: { health: { max: 80, min: 0 } }, movement: { poses: ["standing"], walkSpeed: 2.5 } };
    return null;
  },
  itemById(id) { return Object.hasOwn(ITEMS, id) ? { rarity: ITEMS[id as keyof typeof ITEMS].rarity.toLowerCase(), baseType: id } : null; },
};
export const credit = { text: "Original Deepward vault geometry, signage and item art", handle: "Deepward" };
export const game = defineGame({
  name: "Deepward",
  assets: stationAssets,
  world,
  physics,
  content,
  input: keybinds,
  scene: {
    editorLayers,
    // Engine records own acquisition; the vault's authored meshes own presentation.
    worldItem: { filter: [{ id: "authored-salvage", hide: true }] },
    WorldOverlay,
    renderEntity,
  },
  audio,
  server: { mode: "campaign" },
  save: "none",
  persist: false,
  chrome: { settings: {}, presentation: "3d" },
  scenePlacement: false,
  controls: {
    touch: false,
    platforms: ["web"],
    movement: {
      beforeCommit(frame) {
        const view = viewStore.read(frame.ctx);
        if (view.paused || view.panel !== null || (view.mode !== "home" && view.mode !== "dive")) return frame.current;
        const place: Place = view.mode === "home" || view.dive === null ? "home" : view.dive.stratum;
        // Ink pools drag at the suit: a step through one covers a little over half the ground.
        const drag = view.dive !== null && place !== "home" && hazardsAt(frame.current, place, false).has("ink") ? 0.55 : 1;
        // Subdivide the whole displacement so a long frame cannot tunnel through a wall.
        const steps = Math.max(1, Math.ceil(groundDistance(frame.current, frame.next) / 0.15));
        let x = frame.current[0], z = frame.current[2];
        const dx = (frame.next[0] - x) / steps * drag, dz = (frame.next[2] - z) / steps * drag;
        for (let n = 0; n < steps; n++) {
          if (walkable(x + dx, z + dz, place)) { x += dx; z += dz; }
          else if (walkable(x + dx, z, place)) x += dx;
          else if (walkable(x, z + dz, place)) z += dz;
        }
        return [x, frame.next[1], z];
      },
    },
    orientation: "landscape",
  },
  // Marrow's base and story run on the engine's world model: bays, power, galley flows, story facts.
  systems: [marrowSpec.system],
  loop: { onInit: (ctx) => { initialize(ctx); registerCaptureCommands(ctx); }, onNewPlayer: seatPlayer, onTick: tickControls },
  GameUI,
  hudTheme: shiftTheme,
  // Marrow's console draws the menu verbs as hull switch plates and every pane as the dive-log screen.
  uiKit: deepwardKit,
  camera: {
    perspective: "first",
    rigs: {
      firstPerson: { eyeHeight: 1.62, sensitivity: 0.0021, reticle: false, viewmodel: false },
    },
    lens: { frustum: { far: 95 } },
  },
  rendering: {
    look: "cinematic",
    mood: { preset: "night", fog: { near: 12, far: 48 }, exposure: 0.9, contrast: 1.1 },
    // Practical lamps carry every room: a third of the old 0.72 ambient and 0.5 hemisphere.
    lighting: { ambient: { color: "#d4d5c8", intensity: 0.24 }, hemisphere: { skyColor: "#c7d9df", groundColor: "#514639", intensity: 0.17 } },
    backdrop: { background: C.black, fog: { color: C.black, near: 12, far: 48 } },
    // Reflections only: the vault has no sky.
    environmentSource: hdriEnvironment("industrial-pipe-valve", { intensity: 0.25 }),
    postProcessing: {
      toneMapping: "aces",
      bloom: { strength: 0.18, radius: 0.3, threshold: 0.9 },
      ao: { radius: 1, intensity: 1, distanceFalloff: 3, blend: 1 },
      grade: { vignette: 0.28, lut: lutGrade("cold-teal") },
      // Indoor air: a thin haze the scene fog colours per floor, and a glow around each lit lamp in it.
      atmosphere: { indoor: true, fogDensity: 0.013, fogFalloff: 0.02, fogHeight: 0, fogMax: 0.4, shafts: 0, lamps: 1.25, beams: 0.35 },
    },
  },
  capture: {
    probe: captureProbe,
    // "Enter Marrow" is `deepward.enter`; declaring it keeps a play capture on the same path the title button takes.
    play: ["deepward.enter"],
    // The stash sheet with the fitter's counter: scrip, standing and the locked shelves.
    states: {
      title: [],
      // The menu as a returning player sees it: a dive written to Record I, so Continue carries its
      // depth, its carry and its captured frame. Dev-only staging; the departure is the real one.
      menu: ["deepward.enter", "menu.record"],
      "menu-records": ["deepward.enter", "menu.record", { name: "menu.focus", input: { verb: "records" } }],
      "menu-new": [],
      pause: ["deepward.enter", { name: "deepward.pause", input: { paused: true } }],
      counter: ["deepward.enter", "deepward.openStash"],
      // `deepward.stage` (dev-only) departs through the garage and searches three lockers through the
      // real 1.4 s channel, so the shot lands in a vault room with a loaded cache. `drive --state
      // mid-dive` reaches the same place without walking the vault.
      "mid-dive": ["deepward.enter", "deepward.stage"],
      // Dev-only: a crawler departure straight to each floor, for the per-floor look views below.
      "floor-vault": ["deepward.enter", { name: "deepward.dev.descend", input: { stratum: "vault" } }],
      "floor-cold": ["deepward.enter", { name: "deepward.dev.descend", input: { stratum: "cold" } }],
      "floor-wells": ["deepward.enter", { name: "deepward.dev.descend", input: { stratum: "wells" } }],
      "floor-choir": ["deepward.enter", { name: "deepward.dev.descend", input: { stratum: "choir" } }],
    },
    // One eye-height framing per floor, so a look pass compares the same spot before and after.
    views: {
      receiving: { description: "I / rail receiving from the extraction rail", state: "floor-vault", look: "-2,1.3,-10", lookFrom: "9,0.3,0.35", settleMs: 2500 },
      spine: { description: "I / the return spine toward the printhouse", state: "floor-vault", look: "0,1.3,-34", lookFrom: "16,0.3,0", settleMs: 2500 },
      cold: { description: "II / down the freezer aisles", state: "floor-cold", look: "0,1.3,-14", lookFrom: "14,0.3,0", settleMs: 2500 },
      wells: { description: "III / along the reservoir catwalk", state: "floor-wells", look: "-2,1.3,-3", lookFrom: "10,0.3,0", settleMs: 2500 },
      "well-floor": { description: "III / the ink well floor", state: "floor-wells", look: "0,1.2,-33", lookFrom: "8,0.4,0.3", settleMs: 2500 },
      choir: { description: "IV / the choir hall toward the sanctum", state: "floor-choir", look: "-3.75,1.7,-4", lookFrom: "14,-0.1,0", settleMs: 2500 },
    },
  },
});
