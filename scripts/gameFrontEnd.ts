import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { eachGameSource } from "./gameSourceScan";
import type { RatchetFinding } from "./ratchet";

/**
 * #1585: CLAUDE.md requires every game to ship a settings surface and reachable in-game credits.
 * Both are detected by what the game's UI actually references — the shipped building blocks, or a
 * game-owned screen named for the job.
 */
const REQUIREMENTS = [
  {
    id: "settings",
    // The declaration, not the trigger: `SettingsTrigger` renders null until a game declares
    // `settings:` in its config, so an imported-but-dead trigger must not satisfy this.
    pattern: /\n\s*settings:\s*\{|SettingsScreen|SettingsPanel/,
    fix: "declare `settings: { ... }` in game.config.ts (the trigger renders nothing without it) and mount `SettingsTrigger` somewhere reachable",
  },
  {
    id: "credits",
    pattern: /CreditsScreen|creditsFor(?:Source|Asset)Ids|creditsForSources|<Credits\b/,
    fix: "add a credits screen — `creditsForSourceIds(ids)` generates the asset attribution, `CreditsScreen` renders it; see `Games/wreckway`",
  },
] as const;

/** Every game missing one of the required front-end surfaces. */
export function findFrontEndGaps(root: string): RatchetFinding[] {
  const sources = eachGameSource(root);
  const byGame = new Map<string, string>();
  for (const { rel, source } of sources) {
    const game = rel.split("/")[1]!;
    byGame.set(game, `${byGame.get(game) ?? ""}\n${source}`);
  }

  const gamesDir = join(root, "Games");
  const gaps: RatchetFinding[] = [];
  for (const game of readdirSync(gamesDir)) {
    try {
      if (!statSync(join(gamesDir, game, "src")).isDirectory()) continue;
    } catch {
      continue;
    }
    const source = byGame.get(game) ?? "";
    for (const requirement of REQUIREMENTS) {
      if (requirement.pattern.test(source)) continue;
      gaps.push({ key: `${game}#${requirement.id}`, where: `Games/${game} — no ${requirement.id}: ${requirement.fix}` });
    }
  }
  return gaps.sort((a, b) => a.key.localeCompare(b.key));
}
