import type { PerceptionMemory, PerceptionPosition, PerceptionStimulusKind } from "../sensor/perception";

/**
 * How a creature treats what it senses. `passive` keeps its distance, `territorial` defends an area
 * and ignores what stays outside it, `predator` hunts what it senses and closes to strike.
 */
export type TemperamentKind = "passive" | "territorial" | "predator";

/** What light does to a creature: draws it toward a lit target, drives it away, or nothing. */
export type TemperamentLight = "attracted" | "averse" | "none";

/** One species' temperament: its kind plus the ranges and thresholds that tune it. */
export interface TemperamentConfig {
  kind: TemperamentKind;
  /** A passive creature flees a sensed target closer than this; a light-averse one backs off this far from a lit one. Default 8. */
  fleeRange?: number;
  /** The area a territorial creature defends, around `home`. Default 6. */
  territoryRadius?: number;
  /** How close it must be to strike. Default 1.8. */
  attackRange?: number;
  /** How light changes its reaction. Default `"none"`. */
  light?: TemperamentLight;
  /** How lit a target must be to count as lit (see {@link TemperamentInput.lightOf}). Default 0.5. */
  litAt?: number;
  /** Below this health fraction anything flees what it senses. Default 0.25; 0 never breaks. */
  breakAt?: number;
  /** A predator charges only on a fact at least this confident; below it, it investigates. Default 0.5. */
  commitConfidence?: number;
  /** Senses whose facts a predator commits on. Default sight and damage: a smell or a noise is investigated. */
  commitCues?: readonly PerceptionStimulusKind[];
}

/** What a creature is doing about what it senses. */
export type TemperamentMode = "idle" | "flee" | "investigate" | "stalk" | "attack" | "guard" | "return";

/** One decision's inputs: where the creature is, its den, its health, and its perception memory. */
export interface TemperamentInput {
  position: PerceptionPosition;
  /** Den or territory centre; a territorial creature defends it and returns to it. */
  home: PerceptionPosition;
  /** Current health as a fraction of max, 0-1. Default 1. */
  health?: number;
  /** Its perception memory (`perception.memory(id)`); the most confident fact leads. */
  memories: readonly PerceptionMemory[];
  /** How lit a remembered target is now (a lamp on is 1, unlit dark is 0). Only light-reactive kinds read it. */
  lightOf?(targetId: string): number;
}

/** The decision: a mode, who it is about, and the point to move toward (null to hold position). */
export interface TemperamentIntent {
  mode: TemperamentMode;
  targetId: string | null;
  goal: PerceptionPosition | null;
  /** Why, in words a debug overlay or a HUD line can show. */
  reason: string;
}

const flat = (a: PerceptionPosition, b: PerceptionPosition): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** A point `distance` from `from`, directly away from `threat`. */
function awayFrom(from: PerceptionPosition, threat: PerceptionPosition, distance: number): PerceptionPosition {
  const dx = from[0] - threat[0];
  const dz = from[2] - threat[2];
  const length = Math.hypot(dx, dz);
  // Standing on the threat: any direction is away, so pick one deterministically.
  if (length < 1e-6) return [from[0] + distance, from[1], from[2]];
  return [from[0] + (dx / length) * distance, from[1], from[2] + (dz / length) * distance];
}

/**
 * Decide what one creature does about what its perception remembers, from its temperament alone:
 * a passive grazer flees what comes near, a territorial guard attacks only intruders inside its
 * area and returns home when they leave, a predator charges what it saw and follows a smell or a
 * noise to where it came from. Light bends all three: an attracted creature walks toward a lit
 * target it senses, an averse one backs away from it. Pure and deterministic, so a game calls it
 * per creature per tick and moves the creature toward `goal` with its own navigation.
 *
 * @capability creature-temperament passive, territorial and predator creatures that react to what perception senses, including light, noise and scent
 */
export function decideTemperament(config: TemperamentConfig, input: TemperamentInput): TemperamentIntent {
  const fleeRange = config.fleeRange ?? 8;
  const territory = config.territoryRadius ?? 6;
  const attackRange = config.attackRange ?? 1.8;
  const light = config.light ?? "none";
  const litAt = config.litAt ?? 0.5;
  const breakAt = config.breakAt ?? 0.25;
  const commit = config.commitConfidence ?? 0.5;
  const commitCues = config.commitCues ?? ["sight", "damage"];
  let lead: PerceptionMemory | null = null;
  for (const memory of input.memories) if (lead === null || memory.confidence > lead.confidence) lead = memory;
  const awayFromHome = flat(input.position, input.home);
  const settle = (reason: string): TemperamentIntent =>
    config.kind === "territorial" && awayFromHome > territory * 0.5
      ? { mode: "return", targetId: null, goal: input.home, reason }
      : { mode: "idle", targetId: null, goal: null, reason };
  if (lead === null) return settle("senses nothing");

  const at = lead.lastKnownPos;
  const range = flat(input.position, at);
  const lit = light !== "none" && (input.lightOf?.(lead.targetId) ?? 0) >= litAt;
  const flee = (reason: string): TemperamentIntent => ({ mode: "flee", targetId: lead!.targetId, goal: awayFrom(input.position, at, fleeRange), reason });
  const close = (reason: string): TemperamentIntent =>
    range <= attackRange
      ? { mode: "attack", targetId: lead!.targetId, goal: at, reason }
      : { mode: "stalk", targetId: lead!.targetId, goal: at, reason };

  if ((input.health ?? 1) < breakAt) return flee("hurt and breaking off");
  if (lit && light === "averse" && range < fleeRange) return flee("backing away from the light");

  if (config.kind === "passive") {
    if (range < fleeRange || lead.cue === "damage") return flee("keeping its distance");
    if (lit && light === "attracted") return { mode: "investigate", targetId: lead.targetId, goal: at, reason: "drawn to the light" };
    return { mode: "idle", targetId: lead.targetId, goal: null, reason: "watching from a distance" };
  }

  if (config.kind === "territorial") {
    const intruding = flat(at, input.home) <= territory || lead.cue === "damage";
    if (intruding) return close("defending its ground");
    if (lit && light === "attracted") return { mode: "guard", targetId: lead.targetId, goal: input.home, reason: "watching the light from its post" };
    return awayFromHome > territory * 0.5
      ? { mode: "return", targetId: lead.targetId, goal: input.home, reason: "back to its post" }
      : { mode: "guard", targetId: lead.targetId, goal: null, reason: "watching the edge of its ground" };
  }

  const certain = lead.confidence >= commit && commitCues.includes(lead.cue ?? "sight");
  if (certain || (lit && light === "attracted")) return close(lit && light === "attracted" ? "hunting the light" : "hunting what it saw");
  return { mode: "investigate", targetId: lead.targetId, goal: at, reason: lead.cue === "scent" ? "following a scent" : "going to check a noise" };
}
