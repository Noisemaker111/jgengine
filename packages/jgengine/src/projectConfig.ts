import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The file at a game's root that says what the game is and what it uses. */
export const PROJECT_CONFIG_FILE = "jgengine.json";

/** What `jgengine create --template` starts a game from; `jgengine sync` keeps its shared files current. */
export const GAME_TEMPLATES = ["3d", "2d", "builder"] as const;
export type GameTemplate = (typeof GAME_TEMPLATES)[number];

/** A game-facing capability whose domain a game has while it runs its own version. */
export interface CapabilityDebt {
  /** What the game does in that domain today, for the reader; no check reads it. */
  reason?: string;
  /** The issue that tracks adopting the shared system. */
  issue: number;
}

/**
 * What an engine monorepo game writes about capabilities. Adoption is not written: the check reads
 * it from the game's imports.
 */
export interface CapabilityAnswers {
  /** Boot probes, by module, that prove an adopted system live on the running page. */
  probes?: Record<string, string[]>;
  /** Capability id to its debt. */
  debt?: Record<string, CapabilityDebt>;
}

/**
 * A game's `jgengine.json`: the one place that says what the game is and uses. `jgengine create`
 * writes it and `jgengine sync` makes the game match it and the running engine.
 */
export interface ProjectConfig {
  /** The player-facing title. */
  name: string;
  /** Kebab-case id: the package name (`@games/<id>` in the engine monorepo). */
  id: string;
  /**
   * The template the game was created from. Sync rewrites that template's shared files (wiring,
   * page, tooling scripts, agent guide) from the running engine. No template: the game owns every
   * file and sync manages its engine packages only.
   */
  template?: GameTemplate;
  /** The scene editor wiring (`F2+E`); templates 3d and builder. Default true. */
  editor?: boolean;
  /** `@jgengine/*` packages the game runs on, without the scope: `["core", "react", "shell"]`. */
  engine: string[];
  /** Template files this game rewrote and owns; sync leaves them alone. */
  owns?: string[];
  /** Engine monorepo games: boot probes and adoption debt (adoption itself is read from source). */
  capabilities?: CapabilityAnswers;
}

/** Read and validate `<dir>/jgengine.json`; throws with the field at fault. */
export function readProjectConfig(dir: string): ProjectConfig {
  const path = join(dir, PROJECT_CONFIG_FILE);
  if (!existsSync(path)) throw new Error(`no ${PROJECT_CONFIG_FILE} in ${dir} (jgengine create writes one)`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${path} must be a JSON object`);
  const config = raw as Partial<ProjectConfig>;
  if (typeof config.name !== "string" || config.name.trim() === "") throw new Error(`${path}: "name" must be the game's title`);
  if (typeof config.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(config.id)) throw new Error(`${path}: "id" must be kebab-case`);
  if (config.template !== undefined && !GAME_TEMPLATES.includes(config.template)) {
    throw new Error(`${path}: "template" must be one of ${GAME_TEMPLATES.join(", ")}`);
  }
  if (!Array.isArray(config.engine) || config.engine.some((name) => typeof name !== "string" || name.startsWith("@"))) {
    throw new Error(`${path}: "engine" lists @jgengine packages without the scope, e.g. ["core", "react", "shell"]`);
  }
  if (config.editor !== undefined && typeof config.editor !== "boolean") throw new Error(`${path}: "editor" must be true or false`);
  if (config.editor === true && config.template === "2d") throw new Error(`${path}: the 2d template has no scene editor`);
  if (config.owns !== undefined && (!Array.isArray(config.owns) || config.owns.some((file) => typeof file !== "string"))) {
    throw new Error(`${path}: "owns" lists file paths`);
  }
  return config as ProjectConfig;
}

/** `jgengine.json` text in its fixed key order. */
export function renderProjectConfig(config: ProjectConfig): string {
  const ordered: ProjectConfig = {
    name: config.name,
    id: config.id,
    ...(config.template === undefined ? {} : { template: config.template }),
    ...(config.editor === undefined ? {} : { editor: config.editor }),
    engine: [...config.engine].sort(),
    ...(config.owns === undefined || config.owns.length === 0 ? {} : { owns: [...config.owns].sort() }),
    ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
