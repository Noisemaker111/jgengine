import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { cavesOf } from "./caves";
import { creatureAlive, creatureHealth, endStorms, spawnCreature, stormView } from "./creatures";
import { ROOT_SERVER } from "./data/rootServer";
import { give, grantXp } from "./survivor";

/**
 * The Root Server: an ancient buried datacenter at the bottom of the cave whose path carries
 * `boss: "root_server"` in editor.scene.json, and the source of the Signal Storms. It boots when the
 * technician walks into the chamber, holds its ground with a shock pulse, and spins up Choir firewall
 * drones on a timer, faster as it is hurt. Destroying it ends the storms for good and pays out.
 */
interface RootServerState {
  /** The live server's creature id, or null while dark. */
  id: string | null;
  defeated: boolean;
  /** Seconds to its next firewall spin-up. */
  firewallIn: number;
  /** Firewall drones it has up. */
  firewall: string[];
  /** The health phase it last announced (0, 1, 2). */
  phase: number;
}

const stateOf = perContext((): RootServerState => ({ id: null, defeated: false, firewallIn: 0, firewall: [], phase: 0 }));

function chamber(ctx: GameContext) {
  const cave = cavesOf(ctx).find((entry) => entry.boss === ROOT_SERVER.species);
  return cave === undefined ? null : { cave, center: cave.layout.chamber.center, radius: cave.layout.chamber.radius };
}

/** Health share at which each phase starts, and how often it spins up firewall drones in it. */
function phaseAt(share: number): number {
  let at = 0;
  ROOT_SERVER.phases.forEach((phase, index) => {
    if (share <= phase.at) at = index;
  });
  return at;
}

export function tickRootServer(ctx: GameContext, dt: number): void {
  const state = stateOf(ctx);
  if (state.defeated) return;
  const room = chamber(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (room === null || me === null) return;
  const near = Math.hypot(me.position[0] - room.center[0], me.position[2] - room.center[1]) <= room.radius + ROOT_SERVER.wakeExtra;
  if (state.id === null) {
    if (!near) return;
    state.id = spawnCreature(ctx, ROOT_SERVER.species, room.center, { level: ROOT_SERVER.level });
    state.firewallIn = ROOT_SERVER.phases[0]!.firewallEvery;
    state.phase = 0;
    ctx.game.notices.push({ text: "Racks hum awake in the dark: the Root Server. Its firewall is spinning up.", tone: "deny" });
    return;
  }
  if (!creatureAlive(ctx, state.id)) {
    state.defeated = true;
    state.id = null;
    endStorms(ctx);
    for (const [item, count] of Object.entries(ROOT_SERVER.rewards)) give(ctx, item, count);
    grantXp(ctx, ROOT_SERVER.xp);
    ctx.game.notices.push({ text: "The Root Server goes dark. The broadcasts stop: no more Signal Storms.", tone: "success" });
    return;
  }
  const share = creatureHealth(ctx, state.id) ?? 1;
  const phase = Math.max(0, phaseAt(share));
  if (phase > state.phase) {
    state.phase = phase;
    ctx.game.notices.push({ text: ROOT_SERVER.phases[phase]!.tell, tone: "deny" });
  }
  state.firewall = state.firewall.filter((id) => creatureAlive(ctx, id));
  state.firewallIn -= dt;
  if (!near || state.firewallIn > 0) return;
  const rule = ROOT_SERVER.phases[phase]!;
  state.firewallIn = rule.firewallEvery;
  for (let i = 0; i < rule.firewall && state.firewall.length < ROOT_SERVER.maxFirewall; i += 1) {
    // Out of a rack beside the server, wherever the chamber floor has room.
    const start = ctx.rng() * Math.PI * 2;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = start + (attempt / 8) * Math.PI * 2;
      const reach = 3 + (attempt % 3);
      const id = spawnCreature(ctx, ROOT_SERVER.firewallSpecies, [room.center[0] + Math.sin(angle) * reach, room.center[1] + Math.cos(angle) * reach], { level: ROOT_SERVER.level });
      if (id === null) continue;
      state.firewall.push(id);
      break;
    }
  }
}

export function rootServerView(ctx: GameContext) {
  const state = stateOf(ctx);
  return {
    awake: state.id !== null,
    defeated: state.defeated,
    health: state.id === null ? null : creatureHealth(ctx, state.id),
    phase: state.phase,
    firewall: state.firewall.length,
    storms: stormView(ctx),
  };
}

/** Where the Root Server sleeps, for the map and proofs; null when no cave holds it. */
export function rootServerChamber(ctx: GameContext): readonly [number, number] | null {
  return chamber(ctx)?.center ?? null;
}

export function rootServerSave(ctx: GameContext) {
  return {
    key: "fernwild.rootServer",
    snapshot: () => ({ defeated: stateOf(ctx).defeated }),
    hydrate: (data: { defeated: boolean }) => {
      const state = stateOf(ctx);
      state.defeated = data.defeated;
      state.id = null;
      state.firewall = [];
      if (data.defeated) endStorms(ctx);
    },
  };
}

export function resetRootServer(ctx: GameContext): void {
  const state = stateOf(ctx);
  state.id = null;
  state.defeated = false;
  state.firewall = [];
  state.firewallIn = 0;
  state.phase = 0;
}
