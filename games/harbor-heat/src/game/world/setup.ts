import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";
import { patrol } from "@jgengine/core/scene/behaviors";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import type { EntityColliderSet } from "@jgengine/core/scene/colliders";
import { cityLots, cityRoadWidth, tuneCityLayout, type CityLayout } from "@jgengine/core/world/cityLayout";
import { placeAuthoredObjectsFromDocument } from "@jgengine/core/world/authoredObjects";
import { nearestOnPath } from "@jgengine/core/world/roads";
import { furnitureSpots, parkingSpots, sidewalkPoint } from "@jgengine/core/world/streets";
import { streets } from "../../world";
import { editorLayers } from "../../editorLayers";
import { buildingsForZone } from "./buildings";
import { cityLayout, LOT_ROADS, roadSource, zoneAt } from "./cityLayout";
import { PALM_IDS } from "./models";
import {
  BOUNTY_SPOTS,
  BRIEFCASE_POS,
  AUTHORED_VEHICLE_SPAWNS,
  districtAt,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  GUNSHOP_POS,
  MARCO_POS,
  INEZ_POS,
  PLAYER_SPAWN,
  PROMENADES,
  SAFEHOUSE_POS,
  HHPD_POS,
  WORLD_D,
  WORLD_W,
} from "./districts";
import { vehicleById } from "../entities/vehicles/catalog";

function ground(ctx: GameContext, x: number, z: number): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

/**
 * Snap a ground-vehicle spawn to the nearest curbside parking pose so story cars sit on asphalt
 * (not lawn voids between lots). Aircraft keep their authored pad. (#1519)
 */
export function curbPoseNear(
  x: number,
  z: number,
  fallbackHeading: number,
): { x: number; z: number; heading: number } {
  let best: { dist: number; x: number; z: number; heading: number } | null = null;
  for (const street of streets) {
    for (const spot of parkingSpots(street, { spacing: 14, sides: "both" })) {
      const dist = Math.hypot(spot.position[0] - x, spot.position[1] - z);
      if (best === null || dist < best.dist) {
        best = { dist, x: spot.position[0], z: spot.position[1], heading: spot.heading };
      }
    }
  }
  if (best !== null && best.dist < 120) {
    return { x: best.x, z: best.z, heading: best.heading };
  }
  // Fallback: nearest centerline, nudged half a lane toward the curb.
  let line: { dist: number; x: number; z: number; heading: number } | null = null;
  for (const street of streets) {
    const sample = nearestOnPath(street.path, x, z);
    if (sample === null) continue;
    if (line === null || sample.distance < line.dist) {
      const [tx, tz] = sample.tangent;
      const nx = -tz;
      const nz = tx;
      const edge = street.width / 2 - 1.2;
      line = {
        dist: sample.distance,
        x: sample.point[0] + nx * edge,
        z: sample.point[1] + nz * edge,
        heading: Math.atan2(tx, tz),
      };
    }
  }
  return line !== null ? { x: line.x, z: line.z, heading: line.heading } : { x, z, heading: fallbackHeading };
}

const PED_KIND_BY_ROAD: readonly string[] = [
  "ped_beach",
  "ped_city",
  "ped_city",
  "ped_docks",
  "ped_city",
  "ped_city",
  "ped_city",
  "ped_docks",
  "ped_beach",
];

const STREET_BLOCKERS: readonly (readonly [number, number])[] = [
  [MARCO_POS[0], MARCO_POS[2]],
  [GUNSHOP_POS[0], GUNSHOP_POS[2]],
  [GARAGE_POS[0], GARAGE_POS[2]],
  [DOCK_FIGHT_CENTER[0], DOCK_FIGHT_CENTER[2]],
  [PLAYER_SPAWN[0], PLAYER_SPAWN[2]],
  [SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]],
  [HHPD_POS[0], HHPD_POS[2]],
];

/** Palms cycle by index rather than by roll, so a run of them never repeats the same silhouette. */
function palmAt(index: number): string {
  return PALM_IDS[index % PALM_IDS.length]!;
}

/**
 * The sidewalk prop that fits a location's district. Between districts the streets get palms and
 * planters rather than nothing — a bare kerb running out of the city was the biggest reason the
 * mid-distance read as empty plain.
 */
function districtProp(x: number, z: number, index: number, rng: () => number): string | null {
  const district = districtAt(x, z);
  switch (district?.id) {
    case "mainsail_boulevard": {
      const roll = rng();
      return roll < 0.5 ? palmAt(index) : roll < 0.68 ? "obj_bench" : roll < 0.84 ? "obj_planter" : "obj_signal";
    }
    case "downtown": {
      const roll = rng();
      if (roll < 0.26) return "obj_neon";
      if (roll < 0.4) return "obj_signal";
      if (roll < 0.56) return palmAt(index);
      if (roll < 0.74) return "obj_hydrant";
      return roll < 0.88 ? "obj_trashcan" : "obj_planter";
    }
    case "port_carmine": {
      const roll = rng();
      if (roll < 0.25) return "obj_dumpster";
      if (roll < 0.45) return "obj_barrel";
      if (roll < 0.6) return "obj_barrier";
      if (roll < 0.74) return "obj_trashcan";
      return roll < 0.88 ? "obj_crate_dock" : palmAt(index);
    }
    case "palm_heights": {
      const roll = rng();
      return roll < 0.36 ? "obj_hedge" : roll < 0.58 ? "obj_cactus" : roll < 0.82 ? palmAt(index) : "obj_planter";
    }
    default:
      return rng() < 0.42 ? palmAt(index) : rng() < 0.5 ? "obj_planter" : null;
  }
}

/** A building lot's world footprint, as the city layout placed it. */
export interface BuildingFootprintXZ {
  x: number;
  z: number;
  rotationY: number;
  /** Half the lot's width along its street, metres. */
  halfW: number;
  /** Half the lot's depth back from its street, metres. */
  halfD: number;
}

/** A grounded box body spanning a scaled unit block: the building's real walls, not the 1 m model. */
function blockColliders(size: readonly [number, number, number]): EntityColliderSet {
  return {
    body: {
      name: "body",
      purpose: "physical",
      shape: { kind: "aabb", halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2], offset: [0, size[1] / 2, 0] },
      damageEligible: false,
      blocks: true,
    },
  };
}

/** Lowest ground under a footprint, so a block on a slope meets the ground on every side. */
function footprintFloor(ctx: GameContext, x: number, z: number, rotationY: number, w: number, d: number): number {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  let floor = ctx.world.groundHeightAt(x, z);
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    floor = Math.min(floor, ctx.world.groundHeightAt(x + lx * c + lz * s, z - lx * s + lz * c));
  }
  return floor;
}

/** Stable pick from a list by a lot's position, so a re-lay keeps each corner's look where it can. */
function pickFor<T>(list: readonly T[], x: number, z: number): T | undefined {
  const hash = Math.abs(Math.round(x * 73856093) ^ Math.round(z * 19349663));
  return list[hash % list.length];
}

/**
 * Line every street with buildings from the city layout (`cityLots`): each zone's frontage, depth,
 * setback past the sidewalk, spacing and floor range, corner clearance off crossing streets, and a
 * driveway beside every lot in a zone that has them. A building is the unit block scaled to its lot
 * and storey count, with a matching collider, so nothing ever overhangs a sidewalk or a road.
 */
function placeBuildings(ctx: GameContext, layout: CityLayout, ids: string[]): BuildingFootprintXZ[] {
  const placed: BuildingFootprintXZ[] = [];
  const lots = cityLots(layout, {
    roads: LOT_ROADS,
    zoneAt,
    seed: "harbor-heat-lots",
    area: { center: [0, 0], halfExtents: [WORLD_W / 2, WORLD_D / 2] },
    maxLots: 420,
  });
  for (const lot of lots) {
    const [x, z] = lot.center;
    const { w, d } = lot.footprint;
    if (STREET_BLOCKERS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < Math.max(w, d) / 2 + 10)) continue;
    const spec = pickFor(buildingsForZone(lot.zone), x, z);
    if (spec === undefined) continue;
    const y = footprintFloor(ctx, x, z, lot.rotationY, w, d) - 0.1;
    const size = [w, lot.height + 0.1, d] as const;
    const id = ctx.scene.object.place(spec.id, x, y, z, { rotation: lot.rotationY, visual: { scale: size } });
    ctx.scene.object.setColliders(id, blockColliders(size));
    ids.push(id);
    placed.push({ x, z, rotationY: lot.rotationY, halfW: w / 2, halfD: d / 2 });
    if (lot.driveway !== undefined) {
      const [dx, dz] = lot.driveway.center;
      const drive = ctx.scene.object.place("obj_driveway", dx, ctx.world.groundHeightAt(dx, dz) - 0.02, dz, {
        rotation: lot.driveway.rotationY,
        visual: { scale: [lot.driveway.width, 0.08, lot.driveway.length] },
      });
      ctx.scene.object.setColliders(drive, {});
      ids.push(drive);
    }
  }
  return placed;
}

/** World units between palms on an authored promenade; benches and planters land on alternate steps. */
const PROMENADE_SPACING = 18;

/**
 * Dress every `promenade` path from the scene document: a double row of palms with benches and
 * flowering planters between them. The walk's route, length and shape all come from the authored
 * polyline, so moving the boardwalk is dragging it in the editor.
 */
function dressPromenades(ctx: GameContext, rng: () => number): void {
  let step = 0;
  for (const walk of PROMENADES) {
    for (let segment = 0; segment + 1 < walk.points.length; segment += 1) {
      const [ax, az] = walk.points[segment]!;
      const [bx, bz] = walk.points[segment + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const nx = -dz / length;
      const nz = dx / length;
      const steps = Math.max(1, Math.round(length / PROMENADE_SPACING));
      for (let i = 0; i < steps; i += 1) {
        const t = i / steps;
        const cx = ax + dx * t;
        const cz = az + dz * t;
        step += 1;
        for (const side of [-1, 1] as const) {
          const px = cx + nx * side * 4.5;
          const pz = cz + nz * side * 4.5;
          ctx.scene.object.place(
            PALM_IDS[(step + (side > 0 ? 1 : 0)) % PALM_IDS.length]!,
            Math.round(px),
            ctx.world.groundHeightAt(px, pz),
            Math.round(pz),
            { rotation: rng() * Math.PI * 2 },
          );
        }
        if (step % 3 === 0) {
          const bxp = cx + nx * 8.5;
          const bzp = cz + nz * 8.5;
          ctx.scene.object.place("obj_bench", Math.round(bxp), ctx.world.groundHeightAt(bxp, bzp), Math.round(bzp), {
            rotation: Math.atan2(nx, nz),
          });
        }
        if (step % 4 === 1) {
          const gx = cx - nx * 8.5;
          const gz = cz - nz * 8.5;
          ctx.scene.object.place("obj_planter", Math.round(gx), ctx.world.groundHeightAt(gx, gz), Math.round(gz));
        }
      }
    }
  }
}

/**
 * Lamps and district dressing along every street as the layout draws it now: lamps just inside the
 * kerb, the district's furniture along the sidewalk's outer half, so neither reaches a building.
 */
function placeStreetFurniture(ctx: GameContext, layout: CityLayout, ids: string[]): void {
  const rng = seededRng("harbor-heat-street-props");
  const propOutset = Math.max(0.4, layout.sidewalkWidth - 1.6);
  let propIndex = 0;
  for (const street of roadSource.current()) {
    // Denser lighting the length of every street reads as a lived-in city at night.
    for (const spot of furnitureSpots(street, { spacing: 40, outset: 0.1 })) {
      const [x, z] = spot.position;
      ids.push(ctx.scene.object.place("obj_streetlight", x, ctx.world.groundHeightAt(x, z), z, { rotation: spot.heading }));
    }
    // District-flavored sidewalk dressing: neon + hydrants downtown, palms + benches on Mainsail Boulevard,
    // dock clutter in Port Carmine, planters and desert trees up in Palm Heights. Gameplay POIs are kept
    // clear so signage/contacts stay readable.
    for (const spot of furnitureSpots(street, { spacing: 26, outset: propOutset })) {
      const [x, z] = spot.position;
      if (STREET_BLOCKERS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 12)) continue;
      propIndex += 1;
      const prop = districtProp(x, z, propIndex, rng);
      if (prop === null) continue;
      const isTree = prop.startsWith("obj_palm") || prop === "obj_hedge" || prop === "obj_cactus" || prop === "obj_planter";
      ids.push(
        ctx.scene.object.place(prop, x, ctx.world.groundHeightAt(x, z), z, {
          rotation: isTree ? rng() * Math.PI * 2 : spot.heading,
        }),
      );
    }
  }
}

/** The open square at Mainsail's bounty marker; its dressing keeps this radius clear for the fight. */
const PLAZA_CLEAR = 5;
/** How far from the marker the square's dressing reaches. */
const PLAZA_REACH = 24;
/** Candidate spots are a grid this many metres apart. */
const PLAZA_GRID = 2;

/**
 * The square's furniture, biggest first so the trees claim room before the benches: how many of each,
 * how far a piece keeps from roads and walls (a 25 m jacaranda crown needs more than a bench), how
 * far apart two of the same piece stand, the ground it covers itself, and how far out from the
 * marker it may sit.
 */
const PLAZA_PIECES: readonly { prop: string; count: number; margin: number; spacing: number; footprint: number; minRadius: number }[] = [
  { prop: "obj_shade_tree", count: 2, margin: 2, spacing: 16, footprint: 1.5, minRadius: 11 },
  { prop: "obj_streetlight", count: 4, margin: 0.8, spacing: 9, footprint: 0.4, minRadius: 8 },
  { prop: "obj_hedge", count: 6, margin: 0.8, spacing: 4, footprint: 1, minRadius: 14 },
  { prop: "obj_patio", count: 6, margin: 1.2, spacing: 3.2, footprint: 1, minRadius: 8 },
  { prop: "obj_picnic", count: 2, margin: 1.5, spacing: 4.5, footprint: 1.8, minRadius: 10 },
  { prop: "obj_bench", count: 6, margin: 0.8, spacing: 3, footprint: 1.1, minRadius: 6 },
  { prop: "obj_planter", count: 10, margin: 0.6, spacing: 2.4, footprint: 0.4, minRadius: 6 },
  { prop: "obj_trashcan", count: 3, margin: 0.5, spacing: 3, footprint: 0.4, minRadius: 6 },
  { prop: "obj_dog", count: 1, margin: 0.5, spacing: 1.5, footprint: 0.5, minRadius: 6 },
];
/** Walking room kept between two different pieces, metres. */
const PLAZA_AISLE = 0.8;

/** Whether a point is clear of every road's kerb-to-sidewalk edge and every placed lot, by `margin` metres. */
function plazaClear(layout: CityLayout, boxes: readonly BuildingFootprintXZ[], x: number, z: number, margin: number): boolean {
  for (const road of LOT_ROADS) {
    const near = nearestOnPath(road.path, x, z);
    if (near !== null && near.distance < cityRoadWidth(layout, road.roadClass) / 2 + layout.sidewalkWidth + margin) return false;
  }
  for (const box of boxes) {
    const c = Math.cos(box.rotationY);
    const s = Math.sin(box.rotationY);
    const dx = x - box.x;
    const dz = z - box.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < box.halfW + margin && Math.abs(lz) < box.halfD + margin) return false;
  }
  return true;
}

/**
 * Furnish Mainsail's square around its bounty marker: shade trees, lamps, a hedge line, café sets,
 * picnic tables, benches facing the middle, planters and a dog by a bench. Pieces take spots on a
 * grid that skip anything the layout's roads, sidewalks or lots now cover, so a slider re-lay keeps
 * the square furnished but never on the street. The middle stays open for the bounty fight.
 */
function dressPlaza(ctx: GameContext, layout: CityLayout, boxes: readonly BuildingFootprintXZ[], ids: string[]): void {
  const plaza = BOUNTY_SPOTS.find((spot) => spot.id === "bounty_plaza");
  if (plaza === undefined) return;
  const [cx, , cz] = plaza.position;
  const rng = seededRng("harbor-heat-plaza");
  const spots: { x: number; z: number; radius: number; order: number }[] = [];
  for (let gx = -PLAZA_REACH; gx <= PLAZA_REACH; gx += PLAZA_GRID) {
    for (let gz = -PLAZA_REACH; gz <= PLAZA_REACH; gz += PLAZA_GRID) {
      const radius = Math.hypot(gx, gz);
      if (radius >= PLAZA_CLEAR && radius <= PLAZA_REACH) spots.push({ x: cx + gx, z: cz + gz, radius, order: rng() });
    }
  }
  spots.sort((a, b) => a.order - b.order);
  const placed: { x: number; z: number; prop: string; spacing: number; footprint: number }[] = [];
  for (const piece of PLAZA_PIECES) {
    let left = piece.count;
    for (const spot of spots) {
      if (left === 0) break;
      if (spot.radius < piece.minRadius || !plazaClear(layout, boxes, spot.x, spot.z, piece.margin)) continue;
      const crowded = placed.some((other) => {
        const gap = other.prop === piece.prop ? piece.spacing : other.footprint + piece.footprint + PLAZA_AISLE;
        return Math.hypot(other.x - spot.x, other.z - spot.z) < gap;
      });
      if (crowded) continue;
      placed.push({ x: spot.x, z: spot.z, prop: piece.prop, spacing: piece.spacing, footprint: piece.footprint });
      left -= 1;
      // Seats and the dog face the square's middle; the rest take a turn of their own.
      const seat = piece.prop === "obj_bench" || piece.prop === "obj_dog" || piece.prop === "obj_patio";
      const rotation = seat ? Math.atan2(cx - spot.x, cz - spot.z) : rng() * Math.PI * 2;
      ids.push(ctx.scene.object.place(piece.prop, spot.x, ctx.world.groundHeightAt(spot.x, spot.z), spot.z, { rotation }));
    }
  }
}

/** Everything the city layout decides: buildings, driveways, street furniture and the plaza. */
function layCity(ctx: GameContext, layout: CityLayout): { ids: string[]; buildings: BuildingFootprintXZ[] } {
  const ids: string[] = [];
  const buildings = placeBuildings(ctx, layout, ids);
  placeStreetFurniture(ctx, layout, ids);
  dressPlaza(ctx, layout, buildings, ids);
  return { ids, buildings };
}

/**
 * Lay the city and keep it laid: the layout's sliders (Tune tab, `?debug=1`) re-lay the buildings,
 * driveways and furniture on every change, while the shell redraws the streets from `roadSource`.
 */
const cityRelay = perContext(() => ({
  stop: null as (() => void) | null,
  listeners: new Set<(buildings: readonly BuildingFootprintXZ[]) => void>(),
}));

/**
 * Hear every slider re-lay of this context's city with the lots it now has, so systems built on the
 * blocks (resident walking routes) rebuild with them. Returns the unsubscribe.
 */
export function onCityRelaid(ctx: GameContext, listener: (buildings: readonly BuildingFootprintXZ[]) => void): () => void {
  const relay = cityRelay(ctx);
  relay.listeners.add(listener);
  return () => relay.listeners.delete(listener);
}

function setupCity(ctx: GameContext): readonly BuildingFootprintXZ[] {
  tuneCityLayout(cityLayout);
  let laid = layCity(ctx, cityLayout.get());
  const relay = cityRelay(ctx);
  relay.stop?.();
  relay.stop = cityLayout.subscribe(() => {
    for (const id of laid.ids) ctx.scene.object.remove(id);
    laid = layCity(ctx, cityLayout.get());
    for (const listener of relay.listeners) listener(laid.buildings);
  });
  return laid.buildings;
}

/** Stop re-laying this context's city on layout changes. */
export function disposeWorld(ctx: GameContext): void {
  const relay = cityRelay(ctx);
  relay.stop?.();
  relay.stop = null;
  relay.listeners.clear();
}

export function setupWorld(ctx: GameContext): readonly BuildingFootprintXZ[] {
  const rng = seededRng("harbor-heat-setup");

  const buildings = setupCity(ctx);

  // Authored city parks, the container yard and boardwalk seating: `prop` markers in the scene
  // document, placed through the shared authored-objects primitive so moving or adding one is an
  // editor edit rather than a coordinate in this file.
  placeAuthoredObjectsFromDocument(ctx.scene.object, editorLayers, (x, z) => ctx.world.groundHeightAt(x, z));

  for (const spawn of AUTHORED_VEHICLE_SPAWNS) {
    const def = vehicleById(spawn.catalogId);
    const isAircraft = def?.dynamics.type === "aircraft";
    let x = spawn.position[0];
    let z = spawn.position[2];
    let rotationY = spawn.rotationY;
    if (!isAircraft) {
      const curb = curbPoseNear(x, z, rotationY);
      x = curb.x;
      z = curb.z;
      rotationY = curb.heading;
    }
    ctx.scene.entity.spawn(spawn.catalogId, {
      id: spawn.id,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY,
      role: "prop",
    });
  }

  ctx.scene.entity.spawn("contact_marco", { id: "npc_marco", position: ground(ctx, MARCO_POS[0], MARCO_POS[2]), role: "npc" });
  ctx.scene.entity.spawn("contact_inez", { id: "npc_inez", position: ground(ctx, INEZ_POS[0], INEZ_POS[2]), role: "npc" });

  // Sidewalk life is not a patrol loop per street any more: `game/world/residents.ts` runs the named
  // residents on authored routines through the engine's off-screen world, so each one walks its own
  // day and the ones out of range cost a schedule and a position.

  // Kerbside metal is not hand-placed any more: `game/world/traffic.ts` parks real cars in the
  // authored `traffic_parking` spots, so a parked car is one the traffic system already knows about
  // and drives around instead of a prop it can pass through.

  // Street traffic is not a game loop here any more: `game/world/traffic.ts` drives the authored lane
  // graph (D1.1) with the engine's `createTraffic`, so cars follow lanes, signals, kerbs and each
  // other instead of a per-block patrol rectangle.

  const gangSpots: readonly (readonly [number, number])[] = [
    [DOCK_FIGHT_CENTER[0] - 12, DOCK_FIGHT_CENTER[2] - 8],
    [DOCK_FIGHT_CENTER[0] + 10, DOCK_FIGHT_CENTER[2] - 14],
    [DOCK_FIGHT_CENTER[0] - 4, DOCK_FIGHT_CENTER[2] + 12],
    [DOCK_FIGHT_CENTER[0] + 16, DOCK_FIGHT_CENTER[2] + 6],
    [DOCK_FIGHT_CENTER[0] + 2, DOCK_FIGHT_CENTER[2] - 24],
  ];
  gangSpots.forEach(([x, z], i) => {
    ctx.scene.entity.spawn("ganger_dock", { id: `ganger_${i}`, position: ground(ctx, x, z), role: "npc" });
  });
  ctx.scene.entity.spawn("ganger_enforcer", {
    id: "enforcer_boss",
    position: ground(ctx, BRIEFCASE_POS[0], BRIEFCASE_POS[2] - 6),
    role: "npc",
  });

  ctx.scene.object.place("obj_gunshop_sign", GUNSHOP_POS[0], ctx.world.groundHeightAt(GUNSHOP_POS[0], GUNSHOP_POS[2]), GUNSHOP_POS[2]);
  ctx.scene.object.place(
    "obj_safehouse_sign",
    SAFEHOUSE_POS[0],
    ctx.world.groundHeightAt(SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]),
    SAFEHOUSE_POS[2],
  );
  ctx.scene.object.place("obj_hhpd_sign", HHPD_POS[0], ctx.world.groundHeightAt(HHPD_POS[0], HHPD_POS[2]), HHPD_POS[2]);
  for (let i = 0; i < 8; i += 1) {
    const x = DOCK_FIGHT_CENTER[0] - 20 + rng() * 40;
    const z = DOCK_FIGHT_CENTER[2] - 20 + rng() * 40;
    ctx.scene.object.place("obj_crate_dock", Math.round(x), Math.round(ctx.world.groundHeightAt(x, z)), Math.round(z));
  }

  dressPromenades(ctx, rng);

  // Port Carmine reads as a working waterfront: stacked cargo around the dock beyond the loose crates.
  const cargoSpots: readonly (readonly [number, number, number])[] = [
    [DOCK_FIGHT_CENTER[0] + 24, 0, DOCK_FIGHT_CENTER[2] - 10],
    [DOCK_FIGHT_CENTER[0] + 24, 0, DOCK_FIGHT_CENTER[2] + 4],
    [DOCK_FIGHT_CENTER[0] - 26, 0, DOCK_FIGHT_CENTER[2] + 12],
    [DOCK_FIGHT_CENTER[0] + 40, 0, DOCK_FIGHT_CENTER[2] - 2],
    [DOCK_FIGHT_CENTER[0] + 6, 0, DOCK_FIGHT_CENTER[2] + 28],
  ];
  cargoSpots.forEach(([x, , z], i) => {
    ctx.scene.object.place("obj_cargo", Math.round(x), ctx.world.groundHeightAt(x, z), Math.round(z), {
      rotation: i % 2 === 0 ? 0 : Math.PI / 2,
    });
  });

  ctx.scene.worldItem.spawn({
    itemId: "briefcase_carmine",
    position: [BRIEFCASE_POS[0], ctx.world.groundHeightAt(BRIEFCASE_POS[0], BRIEFCASE_POS[2]) + 0.4, BRIEFCASE_POS[2]],
    rarity: "legendary",
  });

  return buildings;
}
