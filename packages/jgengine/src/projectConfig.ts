import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_CONFIG_FILE = "jgengine.json";

export const GAME_TEMPLATES = ["3d", "2d", "builder"] as const;
export type GameTemplate = (typeof GAME_TEMPLATES)[number];

export interface CapabilityAnswers {
  probes?: Record<string, string[]>;
}

/**
 * What a game must prove, against the engine's game suite (`@jgengine/core/suite/suiteCatalog`): its
 * genres, the entries it cuts with the reason the score shows, and the entries it cannot simulate yet with
 * the file where that logic lives. `jgengine suite <id>` prints the score.
 */
export interface ProjectSuite {
  genres: string[];
  cut?: Record<string, string>;
  notSimulatable?: Record<string, string>;
}

export interface ProjectCreditLine {
  label: string;
  detail?: string;
  href?: string;
}

export interface ProjectCredits {
  title?: string;
  sections: { heading: string; entries: ProjectCreditLine[] }[];
  notice?: string;
}

export interface ProjectConfig {
  name: string;
  id: string;
  template?: GameTemplate;
  editor?: boolean;
  engine: string[];
  owns?: string[];
  capabilities?: CapabilityAnswers;
  credits?: ProjectCredits;
  suite?: ProjectSuite;
  /**
   * The asset pipeline's plan (`bun run games:provision build <id>` in the engine monorepo): which
   * model files under `public/` get simplified levels and baked impostors, and how. Read by
   * `games/shared/buildGameAssets.ts`; the runtime switch thresholds live in `visibility.meshLods`.
   */
  assetBuild?: Record<string, unknown>;
}

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
    throw new Error(`${path}: "engine" lists @jgengine packages without the scope, e.g. ["core", "ui", "shell"]`);
  }
  if (config.engine.includes("react")) throw new Error(`${path}: "engine" names @jgengine/react, which was renamed; use "ui" (@jgengine/ui)`);
  if (config.editor !== undefined && typeof config.editor !== "boolean") throw new Error(`${path}: "editor" must be true or false`);
  if (config.editor === true && config.template === "2d") throw new Error(`${path}: the 2d template has no scene editor`);
  if (config.owns !== undefined && (!Array.isArray(config.owns) || config.owns.some((file) => typeof file !== "string"))) {
    throw new Error(`${path}: "owns" lists file paths`);
  }
  if (config.credits !== undefined && (typeof config.credits !== "object" || config.credits === null || !Array.isArray(config.credits.sections))) {
    throw new Error(`${path}: "credits" is { sections: [{ heading, entries: [{ label, detail?, href? }] }], notice? }`);
  }
  if (config.suite !== undefined) {
    const suite = config.suite;
    const reasons = (value: unknown): boolean =>
      value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((reason) => typeof reason === "string" && reason.trim() !== ""));
    if (typeof suite !== "object" || suite === null || !Array.isArray(suite.genres) || suite.genres.some((genre) => typeof genre !== "string") || !reasons(suite.cut) || !reasons(suite.notSimulatable)) {
      throw new Error(`${path}: "suite" is { genres: [...], cut?: { "<entry id>": "<reason>" }, notSimulatable?: { "<entry id>": "<file>: <why>" } }`);
    }
  }
  return config as ProjectConfig;
}

export function starterCredits(name: string, art: boolean): ProjectCredits {
  return {
    sections: [
      { heading: name, entries: [{ label: name, detail: "game design and code" }] },
      { heading: "Engine", entries: [{ label: "JGengine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" }] },
      ...(art
        ? [
            {
              heading: "3D models",
              entries: [
                { label: "KayKit", detail: "Kay Lousberg, CC0-1.0", href: "https://kaylousberg.com" },
                { label: "Quaternius", detail: "CC0-1.0", href: "https://quaternius.com" },
              ],
            },
          ]
        : []),
    ],
    notice: "Third-party art is CC0. Thank you for playing.",
  };
}

export function renderProjectConfig(config: ProjectConfig): string {
  const ordered: ProjectConfig = {
    name: config.name,
    id: config.id,
    ...(config.template === undefined ? {} : { template: config.template }),
    ...(config.editor === undefined ? {} : { editor: config.editor }),
    engine: [...config.engine].sort(),
    ...(config.owns === undefined || config.owns.length === 0 ? {} : { owns: [...config.owns].sort() }),
    ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
    ...(config.credits === undefined ? {} : { credits: config.credits }),
    ...(config.suite === undefined ? {} : { suite: config.suite }),
    ...(config.assetBuild === undefined ? {} : { assetBuild: config.assetBuild }),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
