// @skill jgengine
/**
 * Engine proposals: a game (in this repo or a project on the npm packages) that needs an engine part
 * the engine lacks writes it in a `<feature>.engine.ts` file next to its own code. That one file is
 * the working shim the game imports, the spec of the part (its exports carry their final names and
 * signatures) and the body of the issue `jgengine propose` prints. It exports a `proposal` built with
 * {@link defineEngineProposal}, which names where the part should live once upstream.
 */

/** How a proposal relates to the engine: a new module, an addition to one, or a changed copy of one. */
export type EngineProposalKind = "new" | "extend" | "fork";

/** The kinds {@link defineEngineProposal} accepts. */
export const ENGINE_PROPOSAL_KINDS: readonly EngineProposalKind[] = ["new", "extend", "fork"];

/** What a `<feature>.engine.ts` file says about the engine part it carries. */
export interface EngineProposal {
  /** Kebab-case id, unique across every game: two games carrying the same id means it moves upstream. */
  readonly id: string;
  /** The public import path the part should live at once upstream, e.g. `@jgengine/core/ai/creatureDriver`. */
  readonly target: string;
  /** One or two sentences: what is missing and why the game needs it. */
  readonly need: string;
  readonly kind: EngineProposalKind;
  /** With `kind: "fork"`: the repository path of the engine file this copies, e.g. `packages/core/src/ai/creatureDriver.ts`. */
  readonly fork?: string | undefined;
  /** The names that will exist at {@link EngineProposal.target} once the part is upstream. */
  readonly exports: readonly string[];
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TARGET = /^@jgengine\/[a-z0-9-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const FORK = /^packages\/[a-z0-9-]+\/src\/[A-Za-z0-9_./-]+\.tsx?$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const KEYS = new Set(["id", "target", "need", "kind", "fork", "exports"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every way `value` fails to be a valid {@link EngineProposal}, one sentence each; empty when it is
 * valid. Pure: `jgengine propose` runs the same rules over the literal it reads from a file.
 */
export function engineProposalProblems(value: unknown): string[] {
  if (!isRecord(value)) return ["a proposal is an object literal"];
  const problems: string[] = [];
  for (const key of Object.keys(value)) if (!KEYS.has(key)) problems.push(`unknown field "${key}"`);

  const { id, target, need, kind, fork, exports } = value;
  if (typeof id !== "string" || !ID.test(id)) problems.push(`id must be kebab-case (a-z, 0-9, single dashes), got ${JSON.stringify(id)}`);
  if (typeof target !== "string" || !TARGET.test(target)) {
    problems.push(`target must be a public @jgengine import path such as "@jgengine/core/ai/creatureDriver", got ${JSON.stringify(target)}`);
  } else if (/\/(?:src|dist|node_modules)(?:\/|$)/.test(target)) {
    problems.push(`target names a public import path, not a file inside the package: ${target}`);
  }
  if (typeof need !== "string" || need.trim().length === 0) problems.push("need must say what is missing and why");
  if (typeof kind !== "string" || !(ENGINE_PROPOSAL_KINDS as readonly string[]).includes(kind)) {
    problems.push(`kind must be one of ${ENGINE_PROPOSAL_KINDS.join(", ")}, got ${JSON.stringify(kind)}`);
  }
  if (kind === "fork") {
    if (typeof fork !== "string" || !FORK.test(fork)) problems.push(`a fork names the engine file it copies, as "packages/<pkg>/src/<path>.ts", got ${JSON.stringify(fork)}`);
  } else if (fork !== undefined) {
    problems.push(`fork is only for kind "fork" (kind is ${JSON.stringify(kind)})`);
  }
  if (!Array.isArray(exports) || exports.length === 0) {
    problems.push("exports must list at least one name the target will export");
  } else {
    const seen = new Set<string>();
    for (const name of exports) {
      if (typeof name !== "string" || !IDENTIFIER.test(name)) problems.push(`exports holds an invalid name: ${JSON.stringify(name)}`);
      else if (seen.has(name)) problems.push(`exports lists ${name} twice`);
      else seen.add(name);
    }
  }
  return problems;
}

/**
 * Declare the engine part a `<feature>.engine.ts` file carries. Returns `proposal` unchanged and
 * throws when it is invalid, so a broken proposal fails the first time the game loads it.
 *
 * @example
 * export const proposal = defineEngineProposal({
 *   id: "creature-terrain-mode",
 *   target: "@jgengine/core/ai/creatureDriver",
 *   need: "Creatures cannot follow terrain height while wandering; the driver only knows a flat plane.",
 *   kind: "extend",
 *   exports: ["createCreatureDriver"],
 * });
 */
export function defineEngineProposal<const T extends EngineProposal>(proposal: T): T {
  const problems = engineProposalProblems(proposal);
  if (problems.length > 0) {
    const id = isRecord(proposal) && typeof proposal.id === "string" ? ` ${proposal.id}` : "";
    throw new Error(`invalid engine proposal${id}: ${problems.join("; ")}`);
  }
  return proposal;
}
