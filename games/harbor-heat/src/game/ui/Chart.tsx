/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { headingToBearing, projectToMinimap, type MinimapView } from "@jgengine/core/map/minimap";
import type { WorldBlip } from "@jgengine/core/worldModel/worldModel";
import { useGameStore } from "@jgengine/ui/hooks";
import { cityOf } from "../cityRuntime";
import { safehouseStore } from "../commands";
import { drivingStore, raceStore, wantedStore } from "../streetPlay";
import { courierStore, DELIVERY_ROUTES, CATERING_STALL } from "../jobs/courier";
import { stashStore } from "../jobs/stashes";
import { customerSpot, OVEN, shiftStore, SWAP_DOCKS } from "../pizza/shift";
import { FLOOD_SHEETS, tideStore } from "../tide/tideRuntime";
import { gigStore } from "../jobs/gigs";
import { DISTRICTS, districtAt, RACE_ROUTES, ROADS, SAFEHOUSE_POS, SHORE_X, STASH_SPOTS } from "../world/districts";
import { StreetSign, Text, useRoom, useVersioned } from "./kit";
import { HH, DISPLAY } from "./theme";

type Pt = readonly [number, number];
const RADIUS = 130;
const TINTS: Record<string, string> = { mainsail_boulevard: "#dcc79b", downtown: "#a8a496", port_carmine: "#918e84", palm_heights: "#b9ad7e" };
/** Sea and beach bands, in world XZ: the same coastline the terrain's shore falloff carves. */
const SEA: Pt[] = [[SHORE_X - 22, -600], [-900, -600], [-900, 600], [SHORE_X - 22, 600]];
const BEACH: Pt[] = [[SHORE_X + 24, -600], [SHORE_X - 24, -600], [SHORE_X - 24, 600], [SHORE_X + 24, 600]];
/** World-model blips: the live objective, open jobs, people and places the city marks. */
const BLIP: Record<WorldBlip["kind"], [string, number]> = { objective: ["#ffb020", 5.5], job: ["#ffe066", 5], person: ["#f4e8c8", 4], place: ["#c23b3b", 4], thing: ["#4fa5e8", 4] };

interface Pin { id: string; position: Pt; color: string; radius: number }
const pin = (id: string, position: Pt, color: string, radius: number): Pin => ({ id, position, color, radius });
/** Each flood sheet as a 24-point ellipse in world XZ, drawn over its district once the water is up. */
const FLOOD_SHAPES = FLOOD_SHEETS.map((sheet) => ({ district: sheet.district, corners: Array.from({ length: 24 }, (_, i): Pt => { const a = (i / 24) * Math.PI * 2; return [sheet.center[0] + Math.cos(a) * sheet.rx, sheet.center[1] + Math.sin(a) * sheet.rz]; }) }));

/** Everything the chart draws, read once per store version. */
function readMap(ctx: GameContext) {
  const body = ctx.scene.entity.get(drivingStore.read(ctx) ?? ctx.player.userId) ?? ctx.scene.entity.get(ctx.player.userId);
  if (body === null) return null;
  const courier = courierStore.read(ctx);
  const race = raceStore.read(ctx);
  const circuit = race?.active === true ? RACE_ROUTES.find((r) => r.id === race.routeId) : undefined;
  const world = cityOf(ctx);
  const taken = new Set(stashStore.read(ctx) ?? []);
  const pins: Pin[] = ctx.scene.entity.list().filter((e) => e.name.startsWith("cop_")).map((cop, i) => pin(`cop-${i}`, [cop.position[0], cop.position[2]], "#4f7de8", 4));
  for (const stash of STASH_SPOTS) if (!taken.has(stash.id)) pins.push(pin(`stash-${stash.id}`, [stash.position[0], stash.position[2]], "#76d4c3", 3));
  if (safehouseStore.read(ctx) === true) pins.push(pin("safehouse", [SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]], "#2fb39a", 4.5));
  for (const blip of world.blips()) pins.push(pin(`${blip.kind}-${blip.id}`, [blip.x, blip.z], ...BLIP[blip.kind]));
  // Scared places: where the city is still reacting to gunfire, a body or a wreck.
  const scared = Object.entries(world.def.places ?? {}).flatMap(([id, place]) => { const at = world.position(id); const fear = world.num(`${id}.fear`); return at === null || fear < 10 ? [] : [{ at, radius: Math.min(place.radius ?? 30, 60), fear }]; });
  // The shop, the swap docks and every door in the bag: the pizza loop's own marks.
  pins.push(pin("oven", OVEN, "#d93a2f", 7));
  for (const dock of SWAP_DOCKS) pins.push(pin(`dock-${dock.id}`, dock.position, "#ff4f8b", 4.5));
  for (const customerId of new Set(shiftStore.read(ctx).bag.map((order) => order.customerId))) {
    const spot = customerSpot(customerId);
    if (spot !== null) pins.push(pin(`drop-${customerId}`, spot, "#fff1d6", 7));
  }
  pins.push(pin("courier", courier.phase === "running" ? DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!.position : CATERING_STALL, "#ffb020", 6.5));
  if (circuit !== undefined && race !== undefined) pins.push(pin("gate", circuit.checkpoints[Math.min(race.checkpoint, circuit.checkpoints.length - 1)]!, "#ffb020", 6.5));
  // Gigs: the job in hand is the amber goal, a hailing fare or a paged race a yellow job pin.
  const gigs = gigStore.read(ctx);
  if (gigs.view?.target != null) pins.push(pin("gig", [gigs.view.target.x, gigs.view.target.z], "#ffb020", 6.5));
  else for (const offer of gigs.offers) if (offer.kindId !== "taxi" || gigs.duty) pins.push(pin(`gig-${offer.id}`, [offer.pickup.x, offer.pickup.z], "#ffe066", 5.5));
  const at: Pt = [body.position[0], body.position[2]];
  const depths = tideStore.read(ctx)?.depths ?? {};
  return { at, heading: headingToBearing(body.rotationY), pins, depths, scared, search: wantedStore.read(ctx)?.search ?? null, district: districtAt(at[0], at[1])?.label };
}

/** What the chart's elements are, leaving out where they sit: the chart re-renders only when this changes. */
function chartShape(ctx: GameContext) {
  const map = readMap(ctx);
  if (map === null) return null;
  return { district: map.district ?? null, flooded: FLOOD_SHAPES.filter((f) => (map.depths[f.district] ?? 0) > 0.02).map((f) => f.district), search: map.search !== null, scared: map.scared.map((s) => s.radius), pins: map.pins.map((p) => ({ id: p.id, color: p.color, radius: p.radius })) };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A thick line segment as a four-point polygon. */
function segment(a: { x: number; y: number }, b: { x: number; y: number }, width: number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * width / 2, ny = (dx / length) * width / 2;
  return [[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]];
}
const PLAYER: Pt[] = [[0, -9], [7, 7], [0, 3], [-7, 7]];

/**
 * The harbor chart on the dash: a round sea chart under a brass bezel that turns with you, the north
 * pin riding the rim, and the green street sign of the district you are standing in. Every position
 * is a bound leaf: the chart re-renders only when a pin appears or leaves.
 */
export function CityMinimap() {
  const room = useRoom();
  const size = room === "wide" ? 168 : 100;
  const rim = room === "wide" ? 12 : 9;
  const scale = size / (RADIUS * 2);
  const half = size / 2;
  const shape = useGameStore(chartShape, same);
  const read = useVersioned(readMap);
  if (shape === null) return null;
  const view = (): MinimapView => { const map = read(); return { center: map?.at ?? [0, 0], worldRadius: RADIUS, size, rotate: map?.heading ?? 0 }; };
  const project = (point: Pt) => projectToMinimap(point, view());
  const polygon = (corners: readonly Pt[]) => bind(() => ({ points: corners.map((c) => { const p = project(c); return [p.x, p.y] as Pt; }), viewBox: [size, size] as const }));
  const full = { pin: [0, 0, null, null] as const, width: size, height: size };
  /** A round mark centred on a bound map point. */
  const dot = (id: string, radius: number, color: string, where: () => Pt) => (
    <RuneView key={id} pin={[0, 0, null, null]} width={radius * 2} height={radius * 2} radius={radius} fill={color} border={{ width: 1.5, color: HH.ink }}
      x={bind(() => project(where()).x - radius)} y={bind(() => project(where()).y - radius)} />
  );
  const pinAt = (id: string) => () => read()?.pins.find((p) => p.id === id)?.position ?? ([0, 0] as Pt);
  const north = () => {
    const map = read();
    const p = project([map?.at[0] ?? 0, (map?.at[1] ?? 0) - RADIUS]);
    const nx = p.x - half, ny = p.y - half, reach = Math.hypot(nx, ny) || 1;
    return { x: half + rim + (nx / reach) * (half + rim * 0.6) - 8, y: half + rim + (ny / reach) * (half + rim * 0.6) - 8 };
  };
  return (
    <RuneView items="center" gap={6}>
      <RuneView width={size + rim * 2} height={size + rim * 2} radius={size / 2 + rim} fill="#b08a3e" border={{ width: 2, color: "#5a4318" }} shadow={{ x: 3, y: 4, blur: 0, color: "#00000066" }} label="City map">
        <RuneView pin={[rim, rim, null, null]} width={size} height={size} radius={half} clip fill="#c9bf9f">
          <RuneView {...full} fill="#12889f" shape={polygon(SEA)} />
          <RuneView {...full} fill="#e6d3a4" shape={polygon(BEACH)} />
          {DISTRICTS.map((d) => {
            const r = d.radius * scale;
            return <RuneView key={d.id} pin={[0, 0, null, null]} width={r * 2} height={r * 2} radius={r} fill={`${TINTS[d.id] ?? "#8f8f86"}d8`}
              x={bind(() => project(d.center).x - r)} y={bind(() => project(d.center).y - r)} />;
          })}
          {ROADS.map((seg, i) => <RuneView key={`road-${i}`} {...full} fill="#f4ead2cc" shape={bind(() => ({ points: segment(project(seg.from), project(seg.to), 4), viewBox: [size, size] as const }))} />)}
          {FLOOD_SHAPES.filter((f) => shape.flooded.includes(f.district)).map((f) => (
            <RuneView key={`flood-${f.district}`} {...full} fill="#1f7fa8" opacity={bind(() => Math.min(0.75, 0.25 + (read()?.depths[f.district] ?? 0) * 0.4))} shape={polygon(f.corners)} />
          ))}
          {shape.scared.map((radius, i) => {
            const r = radius * scale;
            return <RuneView key={`fear-${i}`} pin={[0, 0, null, null]} width={r * 2} height={r * 2} radius={r} fill="#e23b3b"
              opacity={bind(() => Math.min(0.45, (read()?.scared[i]?.fear ?? 0) / 160))}
              x={bind(() => project(read()?.scared[i]?.at ?? [0, 0]).x - r)} y={bind(() => project(read()?.scared[i]?.at ?? [0, 0]).y - r)} />;
          })}
          {shape.search ? (
            <RuneView pin={[0, 0, null, null]} fill="#ef5a3c24" border={{ width: 2, color: HH.coral }}
              width={bind(() => (read()?.search?.radius ?? 0) * scale * 2)} height={bind(() => (read()?.search?.radius ?? 0) * scale * 2)} radius={bind(() => (read()?.search?.radius ?? 0) * scale)}
              x={bind(() => { const s = read()?.search; return s == null ? 0 : project(s.center).x - s.radius * scale; })} y={bind(() => { const s = read()?.search; return s == null ? 0 : project(s.center).y - s.radius * scale; })} />
          ) : null}
          {shape.pins.map((p) => dot(p.id, p.radius / 2 + 1, p.color, pinAt(p.id)))}
          <RuneView pin={[half - 9, half - 9, null, null]} width={18} height={18} fill={HH.cream} border={{ width: 1.5, color: HH.ink }} shape={{ points: PLAYER.map(([x, y]) => [x + 9, y + 9] as Pt), viewBox: [18, 18] }} />
        </RuneView>
        <RuneView pin={[0, 0, null, null]} width={16} height={16} radius={8} fill={HH.coral} border={{ width: 1, color: HH.night }} justify="center" items="center"
          x={bind(() => north().x)} y={bind(() => north().y)}>
          <Text family={DISPLAY} size={11} color={HH.cream} text="N" />
        </RuneView>
      </RuneView>
      {shape.district === null ? null : <StreetSign text={shape.district} />}
    </RuneView>
  );
}
