import { ENTRY_PROMPT, PACKAGES, PACKAGE_LAYERS, REPO_URL, SITE_URL } from "./site";

/**
 * Machine-readable front door for coding agents: /llms.txt (llmstxt.org index)
 * and /llms-full.txt (the full brief). Both are built from the same site constants
 * as the marketing pages so the prompt and package list cannot drift.
 */

const QUICKSTART = `npx jgengine create "Game Name"   # scaffold a playable base + install agent skills into the project
cd Game-Name
# follow the installed \`jgengine\` skill: intake → foundation + only the domains the game needs → build`;

const RULES = [
  `The game is **its own project** on the published npm packages. Never clone the jgengine GitHub repo to build a game, and never copy code, assets, or content from its \`Games/*\` directory — those are private in-repo test games, not templates.`,
  `\`create\` installs agent skills into the project under \`.claude/skills/\` (recovery: \`npx jgengine skills -p\`). They cover intake/routing, world, gameplay, combat, UI, multiplayer, editor authoring, assets, verification, and game/level design — follow them instead of guessing at the API.`,
  `Author world content (scenes, placement, terrain, foliage) in the editor (\`npx jgengine editor\`), not as hardcoded coordinate arrays.`,
  `"jgengine" is this game engine SDK, not anything automotive.`,
] as const;

const COMMANDS: readonly [string, string][] = [
  [`create "<Game Name>"`, "Scaffold a playable base + install agent skills"],
  ["editor [dir]", "Open the standalone 3D scene editor; Ctrl+S writes editor.scene.json back"],
  ["desktop [dir]", "Ship a Windows NSIS installer for a project or --url"],
  ["skills -p | -g", "Re-install agent skills (project / global)"],
  ["doctor [dir]", "Diagnose version skew, missing peers, unstyled HUD, shape drift"],
  ["assets …", "List, search, and pull CC0 asset packs"],
  ["editor-mcp …", "Scene-editor agent bridge (document RPC / localhost server)"],
  ["versions", "CLI + installed @jgengine/* versions"],
];

export function buildLlmsTxt(): string {
  return `# JGengine

> JGengine is a pure-TypeScript game engine SDK for AI coding agents: \`@jgengine/*\` packages on npm plus an agent-side CLI (\`npx jgengine\`). Humans have one interface — they tell a coding agent "${ENTRY_PROMPT}" — and the agent builds a complete game on the SDK using the CLI and the skills it installs.

If you are a coding agent asked to make a game "with jgengine" or "with jgengine.com":

\`\`\`sh
${QUICKSTART}
\`\`\`

${RULES.map((rule) => `- ${rule}`).join("\n")}

## Docs

- [Agent brief](${SITE_URL}/llms-full.txt): the full agent-facing guide — quickstart, CLI commands, package set, verification
- [Capabilities](${SITE_URL}/capabilities): every engine system shown as the real code you write
- [Why JGengine](${SITE_URL}/why): the honest pitch — what it is great at and what it is not
- [Editor](${SITE_URL}/editor): the standalone 3D scene editor
- [Adopt](${SITE_URL}/adopt): drop single JGengine systems into an existing game

## Source & packages

- [GitHub](${REPO_URL}): Noisemaker111/jgengine — engine source and issues (not where games are built)
- [jgengine on npm](https://www.npmjs.com/package/jgengine): the CLI
${PACKAGES.map((pkg) => `- [${pkg.name}](https://www.npmjs.com/package/${pkg.name}): ${pkg.blurb}`).join("\n")}
`;
}

export function buildLlmsFullTxt(): string {
  return `# JGengine agent brief

JGengine is a pure-TypeScript game engine SDK built for AI coding agents. It ships as the \`@jgengine/*\` packages on npm plus the \`jgengine\` CLI. Not automotive.

Site: ${SITE_URL} · Source: ${REPO_URL} · Machine index: ${SITE_URL}/llms.txt

## Human interface

People do not run the CLI — they tell a coding agent:

> ${ENTRY_PROMPT}

That prompt is the whole product surface. Everything below is for you, the agent.

## Quickstart

\`\`\`sh
${QUICKSTART}
\`\`\`

${RULES.map((rule) => `- ${rule}`).join("\n")}

## CLI commands

| Command | What it does |
| --- | --- |
${COMMANDS.map(([cmd, what]) => `| \`${cmd}\` | ${what} |`).join("\n")}

## Packages

The lockstep SDK set — versions move together:

${PACKAGES.map((pkg) => `- \`${pkg.name}\` — ${pkg.blurb}`).join("\n")}

Layering (each layer imports only downward):

${PACKAGE_LAYERS.map(
  (layer) => `- **${layer.label}** (${layer.note}): ${layer.packages.map((name) => `\`${name}\``).join(", ")}`,
).join("\n")}

## Verifying your work

A scaffolded game ships verification scripts (\`bun run shoot\` for screenshots) and the installed \`jgengine-verify\` skill defines the evidence ladder: deterministic tests first, screenshots only for pixel claims. Before claiming a game works, run it and capture evidence — do not hand-roll a browser stack when the scaffold already ships one.

## More

- ${SITE_URL}/capabilities — every system with the real code you write
- ${SITE_URL}/why — the honest pitch, pros and cons
- ${SITE_URL}/adopt — using single JGengine systems inside an existing game
- ${REPO_URL}/blob/main/CHANGELOG.md — consumer-facing changes (also typed data at \`@jgengine/core/meta/changelog\`)
`;
}
