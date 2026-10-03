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
| `shoot [...]` | Screenshot the current game headless (WebGL-safe) to `shots/shot.png` (`--device`, `--out`, `--url`, `--settle`, `--timeout`, `--help`); needs Chrome/Chromium |
| `drive [...]` | Play/test the current game headless — `--click`/`--click-at x,y` (CSS viewport pixels)/`--key`/`--wait`/`--shot` steps, `--rpc`, `--playtest --strict`; `--help` for all flags |
| `desktop [dir]` | Ship a Windows NSIS installer for a project or `--url` |
| `skills -p \| -g` | Re-install agent skills (project / global) |
| `doctor [dir] [--workspace [--json]]` | Game diagnostics by default; opt-in aggregate workspace SDK installation checks |
| `upgrade [dir] [--json] [--to x.y.z] [--plan \| --apply]` | Read-only migration report by default; opt-in root workspace catalog authoring |
| `assets …` | List, search, and pull CC0 asset packs (`@jgengine/assets`) |
| `editor-mcp …` | Scene-editor agent bridge (document RPC / localhost server) |
| `versions` | CLI + installed `@jgengine/*` versions |

`doctor` and `upgrade` resolve default and named Bun workspace catalogs and recognize hoisted SDK installs. Missing catalog entries and corrupt installed metadata fail diagnostics. Reports distinguish installed versions from declared baselines; unavailable migration notes never establish that a project is up to date.

`doctor` also follows direct installed consumers (including `file:` links) and SDK dependency/peer edges by real package paths, up to 256 packages. A private SDK copy fails even when its version matches the root copy: identical versions can still own separate module state. The diagnostic names the importer, range, resolved path/version, and canonical project path/version; review the root SDK catalog and linked-consumer declarations, then reinstall from the root and check again. A root install may leave private linked-package installs intact. Doctor reads manifests without requiring a package root export and never changes files. It covers the declared package graph, not custom bundler aliases or indirect non-SDK dependency chains.

Default `doctor` checks the chosen project's direct consumers and installed SDK graph alongside game diagnostics. For one root installation check, run `jgengine doctor --workspace --json` after installing at the workspace root. It inspects the root and every declared workspace owner, including shared packages such as studios, and returns an aggregate SDK identity verdict and coverage. This mode does not run game source/render audits. Restart running games after installation so cached modules use the updated paths. Unused catalog packages without a project install are listed as uninspected; required dependencies or peers without an install fail.

Workspace mode supports relative literal directories and terminal `directory/*` patterns, including Games' `*` and engine `packages/*`. It streams at most 4096 directory entries, attempts at most 512 candidate manifests, inspects at most 256 workspace directories and 64 patterns, and retains the bounded SDK graph check per owner. Unsupported patterns, missing/malformed literal manifests, unmatched wildcards, escaped or broken symlinks, and exhausted budgets report incomplete coverage and exit nonzero. Directory aliases deduplicate by real directory; distinct directories sharing a manifest still get separate resolution checks. JSON includes every owner graph, coverage counters, exclusions and errors; the command never installs or changes files.

For a workspace catalog upgrade, run `jgengine upgrade --plan --to <published-version>` at the root or in a game. The plan covers existing SDK entries across all root catalogs, prints migrations oldest-first, and lists the owning file, catalog paths, and exact range changes. `--json` also includes the full before/after `package.json` text. Then run `jgengine upgrade --apply --to <published-version>` to print and apply a fresh plan. Omitting `--to` selects the registry's latest core version. Every affected SDK version and its SDK dependencies must be published; a candidate manifest or changelog cannot authorize an apply.

Apply preserves range styles, unrelated text, per-game declarations, CLI/github versions, and an existing root editor override. Held editor entries and direct SDK pins appear explicitly in the report. Changed files are rejected rather than overwritten. Apply updates declarations only: installed packages and lockfiles remain unchanged. Run `bun install` at a Bun catalog workspace root, then `jgengine doctor --workspace --json` once at that root to verify installed SDK identities across declared owners. Rebuild, migrate, and verify game behavior afterward. With `--apply --json`, stdout contains the review plan before the write; stderr and the exit code report write success or failure.

## Packages

The lockstep SDK set is `@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets,navbake}` — versions move together; see `CHANGELOG.md` (also importable as typed data from `@jgengine/core/meta/changelog`).
