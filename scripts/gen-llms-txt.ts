import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPackageSurface, type ApiPackage } from "./apiSurface";

const REPO_URL = "https://github.com/Noisemaker111/jgengine";
const DOCS_URL = "https://jgengine.com";
const SKILL_GUIDE = ".claude/skills/jgengine-api/SKILL.md";

const PACKAGE_GUIDES: Record<string, readonly string[]> = {
  core: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/combat.md", ".claude/skills/jgengine-api/reference/world.md"],
  ws: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/multiplayer.md"],
  sql: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/multiplayer.md"],
  react: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/ui-react.md"],
  convex: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/multiplayer.md"],
  node: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/multiplayer.md"],
  shell: [SKILL_GUIDE, ".claude/skills/jgengine-api/reference/ui-react.md", ".claude/skills/jgengine-api/reference/world.md"],
  assets: [SKILL_GUIDE],
  github: [SKILL_GUIDE],
  jgengine: [SKILL_GUIDE],
};

const PACKAGES = Object.keys(PACKAGE_GUIDES);

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  return end === -1 ? markdown : markdown.slice(end + "\n---".length).replace(/^\n+/, "");
}

function exportBullet(e: ApiPackage["modules"][number]["exports"][number]): string {
  const parts = [`${e.name} (${e.kind})`];
  if (e.signature !== "") parts.push(e.signature);
  const head = parts.join(": ");
  return e.doc !== undefined && e.doc !== "" ? `- ${head} — ${e.doc}` : `- ${head}`;
}

function renderLlmsTxt(root: string, pkg: string, surface: ApiPackage): string {
  const lines: string[] = [];
  lines.push(`# @jgengine/${pkg}`);
  lines.push(`> ${surface.description}`);
  lines.push("");
  lines.push(`Version: ${surface.version}`);
  lines.push("License: AGPL-3.0-only");
  lines.push(`Repository: ${REPO_URL}`);
  lines.push(`Docs: ${DOCS_URL}`);
  lines.push(
    pkg === "assets"
      ? `Imports use deep paths (\`@jgengine/${pkg}/<path>\`); \`@jgengine/${pkg}\` also has a root export.`
      : `Imports use deep paths: \`@jgengine/${pkg}/<path>\`.`,
  );
  lines.push("");
  lines.push("## Exported surface");
  lines.push("");
  for (const module of surface.modules) {
    lines.push(`### @jgengine/${pkg}/${module.path}`);
    lines.push("");
    for (const exported of module.exports) lines.push(exportBullet(exported));
    lines.push("");
  }
  lines.push("## Guides");
  lines.push("");
  for (const guidePath of PACKAGE_GUIDES[pkg] ?? []) {
    lines.push(stripFrontmatter(readFileSync(join(root, guidePath), "utf8")).trim());
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function main(): void {
  const check = process.argv.includes("--check");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const outDir = check ? mkdtempSync(join(tmpdir(), "jg-llms-")) : undefined;
  const failures: string[] = [];

  for (const pkg of PACKAGES) {
    const packageDir = join(root, "packages", pkg);
    const surface = extractPackageSurface(packageDir);
    if (surface.modules.length === 0) failures.push(`${pkg}: extracted 0 modules`);
    for (const guidePath of PACKAGE_GUIDES[pkg] ?? []) {
      try {
        readFileSync(join(root, guidePath), "utf8");
      } catch {
        failures.push(`${pkg}: missing guide ${guidePath}`);
      }
    }
    if (failures.some((f) => f.startsWith(`${pkg}:`))) continue;

    const content = renderLlmsTxt(root, pkg, surface);
    const outPath = outDir !== undefined ? join(outDir, `${pkg}.llms.txt`) : join(packageDir, "llms.txt");
    writeFileSync(outPath, content);
    console.log(`OK ${pkg}: ${surface.modules.length} modules -> ${outPath}`);
  }

  if (check && failures.length > 0) {
    console.error(`\ncheck-llms failed:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exit(1);
  }
}

if (import.meta.main) main();
