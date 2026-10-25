import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { headingToBearing, projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";
import type { WorldBlip } from "@jgengine/core/worldModel/worldModel";
import { useGameStore } from "@jgengine/react/hooks";
import { MinimapChrome, type MinimapChromeMarker } from "@jgengine/react/map";
import { cityOf } from "../../cityRuntime";
import { safehouseStore } from "../../commands";
import { drivingStore, raceStore, wantedStore } from "../../handroll";
import { bountyStore } from "../../jobs/bounties";
import { courierStore, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";
import { stashStore } from "../../jobs/stashes";
import { gigStore } from "../../jobs/gigs";
import { BOUNTY_SPOTS, DISTRICTS, districtAt, RACE_ROUTES, ROADS, SAFEHOUSE_POS, SHORE_X, STASH_SPOTS } from "../../world/districts";
import { StreetSign, useRoom } from "../fiction/kit";

const RADIUS = 130;
const TINTS: Record<string, string> = { mainsail_boulevard: "#dcc79b", downtown: "#a8a496", port_carmine: "#918e84", palm_heights: "#b9ad7e" };
/** Sea and beach bands, in world XZ: the same coastline the terrain's shore falloff carves. */
const SEA = [[SHORE_X - 22, -600], [-900, -600], [-900, 600], [SHORE_X - 22, 600]] as const;
const BEACH = [[SHORE_X + 24, -600], [SHORE_X - 24, -600], [SHORE_X - 24, 600], [SHORE_X + 24, 600]] as const;
const points = (corners: readonly (readonly [number, number])[], view: MinimapView) => corners.map((c) => { const p = projectToMinimap(c, view); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
/** World-model blips: the live objective, open jobs, people and places the city marks. */
const BLIP: Record<WorldBlip["kind"], [string, number]> = { objective: ["#ffb020", 5.5], job: ["#ffe066", 5], person: ["#f4e8c8", 4], place: ["#c23b3b", 4], thing: ["#4fa5e8", 4] };
const dot = (id: string, position: readonly [number, number], color: string, radius: number): MinimapChromeMarker => ({ id, position, color, radius, strokeColor: "#0e2c38", strokeWidth: 1.5 });

/** Everything the map pins: the goal in amber, police in blue, the rest small. */
function readMap(ctx: GameContext) {
  const body = ctx.scene.entity.get(drivingStore.read(ctx) ?? ctx.player.userId) ?? ctx.scene.entity.get(ctx.player.userId);
  if (body === null) return null;
  const courier = courierStore.read(ctx);
  const race = raceStore.read(ctx);
  const circuit = race?.active === true ? RACE_ROUTES.find((r) => r.id === race.routeId) : undefined;
  const world = cityOf(ctx);
  const bounty = bountyStore.read(ctx);
  const spot = bounty?.targetId == null ? undefined : BOUNTY_SPOTS.find((s) => s.id === bounty.spotId);
  const taken = new Set(stashStore.read(ctx) ?? []);
  const markers: MinimapChromeMarker[] = ctx.scene.entity.list().filter((e) => e.name.startsWith("cop_")).map((cop, i) => dot(`cop-${i}`, [cop.position[0], cop.position[2]], "#4f7de8", 4));
  for (const stash of STASH_SPOTS) if (!taken.has(stash.id)) markers.push(dot(`stash-${stash.id}`, [stash.position[0], stash.position[2]], "#76d4c3", 3));
  if (safehouseStore.read(ctx) === true) markers.push(dot("safehouse", [SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]], "#2fb39a", 4.5));
  if (spot !== undefined) markers.push(dot("bounty", [spot.position[0], spot.position[2]], "#ef5a3c", 5));
  for (const blip of world.blips()) markers.push(dot(`${blip.kind}-${blip.id}`, [blip.x, blip.z], ...BLIP[blip.kind]));
  // Scared places: where the city is still reacting to gunfire, a body or a wreck.
  const scared = Object.entries(world.def.places ?? {}).flatMap(([id, place]) => { const at = world.position(id); const fear = world.num(`${id}.fear`); return at === null || fear < 10 ? [] : [{ at, radius: Math.min(place.radius ?? 30, 60), fear }]; });
  markers.push(dot("courier", courier.phase === "running" ? DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!.position : DISPATCH, "#ffb020", 6.5));
  if (circuit !== undefined && race !== undefined) markers.push(dot("gate", circuit.checkpoints[Math.min(race.checkpoint, circuit.checkpoints.length - 1)]!, "#ffb020", 6.5));
  // Gigs: the job in hand is the amber goal, a hailing fare or a paged race a yellow job pin.
  const gigs = gigStore.read(ctx);
  if (gigs.view?.target != null) markers.push(dot("gig", [gigs.view.target.x, gigs.view.target.z], "#ffb020", 6.5));
  else for (const offer of gigs.offers) if (offer.kindId !== "taxi" || gigs.duty) markers.push(dot(`gig-${offer.id}`, [offer.pickup.x, offer.pickup.z], "#ffe066", 5.5));
  const heading = headingToBearing(body.rotationY);
  markers.push({ ...dot("player", [body.position[0], body.position[2]], "#fff0d2", 9), heading, clampToEdge: false });
  return { at: [body.position[0], body.position[2]] as const, heading, markers, scared, search: wantedStore.read(ctx)?.search ?? null };
}

/**
 * The harbor chart on the dash: a round sea chart under a brass bezel that turns with you, the north
 * pin riding the rim, and the green street sign of the district you are standing in bolted beneath.
 */
export function CityMinimap() {
  const room = useRoom();
  const compact = room !== "wide";
  const size = room === "wide" ? 168 : room === "short" ? 100 : 116;
  const map = useGameStore(readMap);
  if (map === null) return null;
  const view: MinimapView = { center: map.at, worldRadius: RADIUS, size, rotate: map.heading };
  const scale = size / (RADIUS * 2);
  const search = map.search === null ? null : projectToMinimap(map.search.center, view);
  const half = size / 2;
  const north = projectToMinimap([map.at[0], map.at[1] - RADIUS], view);
  const nx = north.x - half;
  const ny = north.y - half;
  const reach = Math.hypot(nx, ny) || 1;
  const rim = half + (compact ? 7 : 9);
  const district = districtAt(map.at[0], map.at[1])?.label;
  return (
    <div className="hh-chart" style={{ width: size + (compact ? 18 : 24) }}>
      <span className="hh-chart-bezel" style={{ width: size + (compact ? 18 : 24), height: size + (compact ? 18 : 24) }}>
        <svg className="hh-chart-map" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="City map">
          <defs>
            <clipPath id="hh-chart-clip"><circle cx={half} cy={half} r={half} /></clipPath>
          </defs>
          <g clipPath="url(#hh-chart-clip)">
            <rect width={size} height={size} fill="#c9bf9f" />
            <polygon points={points(SEA, view)} fill="#12889f" />
            <polygon points={points(BEACH, view)} fill="#e6d3a4" />
            {DISTRICTS.map((d) => { const c = projectToMinimap(d.center, view); return <circle key={d.id} cx={c.x} cy={c.y} r={d.radius * scale} fill={TINTS[d.id] ?? "#8f8f86"} fillOpacity={0.85} />; })}
            {ROADS.map((seg, i) => { const a = projectToMinimap(seg.from, view); const b = projectToMinimap(seg.to, view); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f4ead2" strokeWidth={4} strokeOpacity={0.8} strokeLinecap="round" />; })}
            {map.scared.map((place, i) => { const c = projectToMinimap(place.at, view); return <circle key={`fear-${i}`} cx={c.x} cy={c.y} r={place.radius * scale} fill="#e23b3b" fillOpacity={Math.min(0.45, place.fear / 160)} />; })}
            {search === null || map.search === null ? null : <circle cx={search.x} cy={search.y} r={map.search.radius * scale} fill="#ef5a3c" fillOpacity={0.14} stroke="#ef5a3c" strokeWidth={2} strokeDasharray="4 3" />}
            <MinimapChrome view={view} markers={map.markers} />
          </g>
          <circle cx={half} cy={half} r={half - 1} fill="none" stroke="rgba(7, 29, 37, 0.55)" strokeWidth={2} />
        </svg>
        <span className="hh-chart-north" style={{ transform: `translate(${(nx / reach) * rim}px, ${(ny / reach) * rim}px)` }}>N</span>
      </span>
      {district === undefined ? null : <StreetSign className="hh-chart-sign">{district}</StreetSign>}
    </div>
  );
}
