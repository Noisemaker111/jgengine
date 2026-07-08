import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advancePathFollow, createPathFollow, type PathFollowState, type Waypoint } from "@jgengine/core/nav/pathFollow";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";

import { DAY_LENGTH } from "./calendar";
import { record } from "./chronicle";
import { historyRng } from "./rng";
import { settlements, type Settlement } from "./settlements";
import { terrainDescriptor } from "../world";

const CARAVAN_ENTITY_KIND = "caravan";
const SPEED_UNITS_PER_DAY = 6;
const ROUTE_SAMPLES = 24;
const CARAVAN_GROUND_CLEARANCE = 0.6;
const SPAWN_INTERVAL_DAYS = 20;

interface Caravan {
  entityId: string;
  from: Settlement;
  to: Settlement;
  config: { waypoints: readonly Waypoint[]; speed: number };
  follow: PathFollowState;
}

let caravans: Caravan[] = [];
let field: TerrainField | null = null;

function terrainField(): TerrainField {
  if (field === null) field = resolveTerrainField(terrainDescriptor);
  return field;
}

function buildRoute(from: Settlement, to: Settlement): Waypoint[] {
  const sample = terrainField();
  const waypoints: Waypoint[] = [];
  for (let step = 0; step <= ROUTE_SAMPLES; step += 1) {
    const t = step / ROUTE_SAMPLES;
    const x = from.position.x + (to.position.x - from.position.x) * t;
    const z = from.position.z + (to.position.z - from.position.z) * t;
    waypoints.push([x, sample.sampleHeight(x, z) + CARAVAN_GROUND_CLEARANCE, z]);
  }
  return waypoints;
}

function pickRoute(): readonly [Settlement, Settlement] {
  const from = settlements[Math.floor(historyRng() * settlements.length)] ?? settlements[0]!;
  let to = settlements[Math.floor(historyRng() * settlements.length)] ?? settlements[0]!;
  let guard = settlements.length + 2;
  while (to.id === from.id && guard > 0) {
    to = settlements[Math.floor(historyRng() * settlements.length)] ?? settlements[0]!;
    guard -= 1;
  }
  return [from, to];
}

export function spawnCaravan(ctx: GameContext): void {
  if (settlements.length < 2) return;
  const [from, to] = pickRoute();
  const waypoints = buildRoute(from, to);
  const speed = SPEED_UNITS_PER_DAY / DAY_LENGTH;
  const config = { waypoints, speed };
  const entityId = ctx.scene.entity.spawn(CARAVAN_ENTITY_KIND, {
    position: waypoints[0],
    role: "npc",
  });
  ctx.player.possession.own(ctx.player.userId, entityId);
  caravans = [...caravans, { entityId, from, to, config, follow: createPathFollow(config) }];
  record(ctx, "caravan", `A caravan departs ${from.name} bound for ${to.name}.`);
}

export function tickCaravans(ctx: GameContext, dt: number): void {
  if (caravans.length === 0) return;
  const arrived: Caravan[] = [];
  for (const caravan of caravans) {
    const next = advancePathFollow(caravan.config, caravan.follow, dt);
    caravan.follow = next;
    ctx.scene.entity.setPose(caravan.entityId, { position: next.position, rotationY: next.heading, dt });
    if (next.done) arrived.push(caravan);
  }
  if (arrived.length === 0) return;
  const arrivedIds = new Set(arrived.map((caravan) => caravan.entityId));
  caravans = caravans.filter((caravan) => !arrivedIds.has(caravan.entityId));
  for (const caravan of arrived) {
    ctx.scene.entity.despawn(caravan.entityId);
    record(ctx, "caravan", `A caravan reaches ${caravan.to.name} from ${caravan.from.name}.`);
  }
}

export function scheduleCaravans(ctx: GameContext): void {
  ctx.time.every(SPAWN_INTERVAL_DAYS * DAY_LENGTH, () => spawnCaravan(ctx));
}

export function isCaravan(entityId: string): boolean {
  return caravans.some((caravan) => caravan.entityId === entityId);
}

export function listCaravans(): readonly { entityId: string; from: Settlement; to: Settlement }[] {
  return caravans;
}
