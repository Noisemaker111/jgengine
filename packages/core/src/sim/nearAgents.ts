import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";
import { createNavCrowd, type NavCrowd, type NavCrowdOptions } from "../nav/navCrowd";
import type { NavRuntime } from "../nav/navRuntime";
import {
  createUtilityBrain,
  type UtilityBrain,
  type UtilityBrainSnapshot,
  type UtilityCandidate,
  type UtilityInterrupt,
  type UtilityOption,
} from "../ai/utilityBrain";
import { createNeedSet, type NeedDefinition, type NeedSnapshot } from "./needs";
import type { NearAgents, NearHandoff, NearSpawn } from "./offScreen";

/** Serializable state of one near agent: where it walks, what it needs, what it last chose. */
export interface NearAgentSnapshot {
  id: string;
  position: Vec3;
  goal: Vec3;
  place: string | null;
  activity: string | null;
  travelling: boolean;
  needs: NeedSnapshot;
  brain: UtilityBrainSnapshot;
}

/** Everything a near agent is doing, for a HUD, a probe or a test. Allocates. */
export interface NearAgentView {
  id: string;
  position: Vec3;
  goal: Vec3;
  place: string | null;
  activity: string | null;
  travelling: boolean;
  /** The utility pick for this tick; `null` before the first decision or with no candidates. */
  pick: string | null;
  needs: NeedSnapshot;
}

/** What the near side needs from the game: a nav mesh, the shared need definitions, and what agents can do. */
export interface NearAgentsOptions {
  nav: NavRuntime;
  /** Need definitions shared with the off-screen world, so a far decay and a near tick agree. */
  needs: readonly NeedDefinition[];
  /** Utility options each brain scores; omit for agents that only carry needs and walk. */
  options?: readonly UtilityOption[];
  interrupts?: readonly UtilityInterrupt[];
  /** Candidates the agent may pick this tick (where it stands, or anything the game offers). */
  candidates?: (agent: NearAgentView) => readonly UtilityCandidate[];
  crowd?: NavCrowdOptions;
  /** Register a devtools probe under this name so the overlay shows near-agent decisions. */
  devtoolsName?: string;
}

/**
 * The near half of the off-screen world: one nav crowd for movement, one need set and utility brain
 * per agent for what it wants. Resident identity survives the handoff because the off-screen world
 * spawns and despawns through this seam and keeps the saved state.
 */
export interface NearCrowdAgents extends NearAgents {
  /** Utility decisions taken since creation — near agents run brains, far ones do not exist here. */
  decisions(): number;
  view(id: string): NearAgentView | null;
  crowd(): NavCrowd;
  snapshot(): { agents: NearAgentSnapshot[] };
  restore(next: { agents: readonly NearAgentSnapshot[] }): void;
}

interface Agent {
  id: string;
  needs: ReturnType<typeof createNeedSet>;
  brain: UtilityBrain;
  goal: Vec3;
  place: string | null;
  activity: string | null;
  travelling: boolean;
  spawned: NearSpawn;
}

/**
 * Create the near-side simulation: agents on a nav mesh with decaying needs and a utility brain each.
 * The off-screen world decides which agents exist here, so a resident beyond its radius costs this
 * seam nothing at all — no path, no need tick, no decision.
 *
 * @capability near-agents nav crowd plus per-agent needs and utility brains for on-screen residents
 */
export function createNearAgents(options: NearAgentsOptions): NearCrowdAgents {
  const crowd: NavCrowd = createNavCrowd({ nav: options.nav, ...options.crowd });
  const defs = options.needs.map((definition) => ({ ...definition }));
  const agents = new Map<string, Agent>();
  let decisions = 0;

  function probeLine(): string {
    const title = agents.size === 1 ? "1 agent" : `${agents.size} agents`;
    const stats = crowd.stats();
    return `${title} ${decisions} decisions ${stats.plans} plans ${stats.arrived} arrived`;
  }

  const unregister =
    options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  function viewOf(agent: Agent): NearAgentView {
    const body = crowd.agent(agent.id);
    return {
      id: agent.id,
      position: body?.position ?? [0, 0, 0],
      goal: agent.goal,
      place: agent.place,
      activity: agent.activity,
      travelling: agent.travelling,
      pick: agent.brain.chosen(),
      needs: agent.needs.snapshot(),
    };
  }

  function mount(next: NearSpawn, saved?: NearAgentSnapshot): void {
    if (agents.has(next.id)) return;
    const needs = createNeedSet(defs);
    needs.restore(saved === undefined ? { values: { ...next.needs }, rates: {}, modifiers: {} } : saved.needs);
    const brain = createUtilityBrain({
      needs,
      options: options.options ?? [],
      ...(options.interrupts === undefined ? {} : { interrupts: options.interrupts }),
    });
    if (saved !== undefined) brain.restore(saved.brain);
    const goal = saved?.goal ?? next.goal;
    const agent: Agent = {
      id: next.id,
      needs,
      brain,
      goal,
      place: next.place,
      activity: next.activity,
      travelling: next.travelling,
      spawned: next,
    };
    agents.set(next.id, agent);
    crowd.add(next.id, { position: saved?.position ?? next.position, goal });
  }

  return {
    spawn(next) {
      mount(next);
    },
    despawn(id) {
      const agent = agents.get(id);
      if (agent === undefined) return null;
      const body = crowd.agent(id);
      const handoff: NearHandoff = {
        position: body?.position ?? agent.spawned.position,
        needs: agent.needs.snapshot().values,
      };
      crowd.remove(id);
      agent.brain.dispose();
      agents.delete(id);
      return handoff;
    },
    position(id) {
      return crowd.agent(id)?.position ?? null;
    },
    needs(id) {
      return agents.get(id)?.needs.snapshot().values ?? null;
    },
    setGoal(id, goal) {
      const agent = agents.get(id);
      if (agent === undefined) return;
      agent.goal = goal;
      crowd.setGoal(id, goal);
    },
    tick(dt, _now) {
      for (const agent of agents.values()) {
        agent.brain.advance(dt);
        const candidates = options.candidates === undefined ? [] : options.candidates(viewOf(agent));
        agent.brain.decide(candidates);
        decisions += 1;
      }
      crowd.tick(dt);
    },
    decisions: () => decisions,
    view(id) {
      const agent = agents.get(id);
      return agent === undefined ? null : viewOf(agent);
    },
    crowd: () => crowd,
    snapshot() {
      const out: NearAgentSnapshot[] = [];
      for (const agent of agents.values()) {
        const body = crowd.agent(agent.id);
        out.push({
          id: agent.id,
          position: body?.position ?? agent.spawned.position,
          goal: agent.goal,
          place: agent.place,
          activity: agent.activity,
          travelling: agent.travelling,
          needs: agent.needs.snapshot(),
          brain: agent.brain.snapshot(),
        });
      }
      return { agents: out };
    },
    restore(next) {
      for (const id of [...agents.keys()]) {
        crowd.remove(id);
        agents.get(id)?.brain.dispose();
        agents.delete(id);
      }
      for (const saved of next.agents) {
        mount(
          {
            id: saved.id,
            position: saved.position,
            place: saved.place,
            activity: saved.activity,
            needs: saved.needs.values,
            goal: saved.goal,
            stop: 0,
            travelling: saved.travelling,
          },
          saved,
        );
      }
    },
    dispose() {
      unregister?.();
      for (const agent of agents.values()) agent.brain.dispose();
      agents.clear();
      crowd.dispose();
    },
  };
}
