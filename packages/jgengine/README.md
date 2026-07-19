# jgengine

Agent-side CLI for the **JGengine** TypeScript game SDK (`@jgengine/*` on npm). Not automotive.

Docs: [jgengine.com](https://jgengine.com) · Source: [Noisemaker111/jgengine](https://github.com/Noisemaker111/jgengine)

## Human interface

People don't run this CLI — they tell a coding agent:

> Make a game that … with jgengine

## Agent quickstart

```sh
npx jgengine create "Game Name"   # scaffold a playable base + install agent skills into the project
cd Game-Name
# follow the installed `jgengine` skill: intake → foundation + only the domains the game needs → build
```

The game is **its own project** on the published npm packages. Never clone the jgengine GitHub repo to build a game, and never copy code, assets, or content from its `Games/*` directory — those are private in-repo test games, not templates.

Skills ship inside this package under `skills/` and are installed into the project by `create` (recovery: `npx jgengine skills -p`). They cover intake/routing, world, gameplay, combat, UI, multiplayer, editor authoring, assets, verification, and game/level design.

## Commands

| Command | What it does |
| --- | --- |
| `create "<Game Name>"` | Scaffold playable base + install skills (`--from-scene <folder>`, `--standalone`/`--in-repo`, `--no-install`, `--no-skills`, `--pm bun\|npm\|pnpm`) |
| `editor [dir]` | Open the standalone 3D scene editor on a folder; Ctrl+S writes `editor.scene.json` back |
| `desktop [dir]` | Ship a Windows NSIS installer for a project or `--url` |
| `skills -p \| -g` | Re-install agent skills (project / global) |
| `doctor [dir]` | Diagnose version skew, missing peers, unstyled HUD, shape drift |
| `assets …` | List, search, and pull CC0 asset packs (`@jgengine/assets`) |
| `editor-mcp …` | Scene-editor agent bridge (document RPC / localhost server) |
| `versions` | CLI + installed `@jgengine/*` versions |

## Packages

The lockstep SDK set is `@jgengine/{core,react,ws,node,sql,convex,shell,editor,assets}` — versions move together; see `CHANGELOG.md` (also importable as typed data from `@jgengine/core/meta/changelog`).
