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
  `The game is **its own project** on the published npm packages. Never clone the jgengine GitHub repo to build a game, and never copy code, assets, or content from its \`games/*\` directory — those are private in-repo test games, not templates.`,
  `\`create\` installs agent skills into the project under \`.claude/skills/\` (recovery: \`npx jgengine skills -p\`). They cover intake/routing, world, gameplay, combat, UI, multiplayer, editor authoring, assets, verification, and game/level design — follow them instead of guessing at the API.`,
  `Author world content (scenes, placement, terrain, foliage) in the editor (\`npx jgengine editor\`), not as hardcoded coordinate arrays.`,
  `"jgengine" is this game engine SDK, not anything automotive.`,
] as const;

const COMMANDS: readonly [string, string][] = [
  [`create "<Game Name>"`, "Scaffold a playable base + install agent skills; writes jgengine.json"],
  ["sync [dir...]", "Make the game match its jgengine.json and the running engine: @jgengine deps, template files; prints release notes crossed (--check changes nothing)"],
  ["find <words>", "Where a concept lives: its folder, exports and shipped capabilities — check before hand-rolling"],
  ["recipe [name]", "Print a vetted, type-checked wired snippet (combat, loot, quests, vehicles, co-op …)"],
  ["shoot", "Screenshot the current game headlessly (WebGL-safe) to shots/shot.png"],
  ["drive", "Play/test the game headlessly: ordered clicks, keys, waits and shots; --playtest --strict for a softlock verdict"],
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
- [Capabilities](${SITE_URL}/capabilities): every shipped capability with its import line
- [Games](${SITE_URL}/games): the games built on the engine, playable in the browser
- [Why jgengine](${SITE_URL}/why): what it is good at and where it falls short
- [Editor](${SITE_URL}/editor): the standalone 3D scene editor
- [Adopt](${SITE_URL}/adopt): use single jgengine systems inside an existing game

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

- ${SITE_URL}/capabilities — every shipped capability with its import line
- ${SITE_URL}/why — strengths and trade-offs
- ${SITE_URL}/adopt — using single jgengine systems inside an existing game
- ${REPO_URL}/blob/main/CHANGELOG.md — consumer-facing changes (also typed data at \`@jgengine/core/meta/changelog\`)
`;
}
