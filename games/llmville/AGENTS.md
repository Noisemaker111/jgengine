# LLMville agent instructions

The repository's root [AGENTS.md](../AGENTS.md) governs workflow here: lanes in
`.claude/worktrees/<name>`, engine source from `packages/`, and `bun run lane:close` to land.
This file adds what is specific to LLMville.

## Production is not deployed from here

llmville.com (Cloudflare Worker `llmville`) and Convex prod `adorable-oriole-506` deploy from
`master` of `Noisemaker111/LLMville` until Jon switches them. Never run `convex deploy`,
`wrangler deploy` or a prod migration from this repository, and never point local dev at the
production deployment. Local dev runs against a local anonymous Convex (see README "Develop").

## Architecture and ownership

LLMville is a cosy cooperative AI-lab tycoon: build a lab, install hardware, collect data, train
models, serve them, earn income and expand in a shared world.

- This folder (`src/`): React, Vite, TanStack Router, React Three Fiber and Convex adapters.
  Domain UI lives in `<domain>/components/`, shared primitives in `components/ui/`, and
  `src/runtime` holds browser and React adapters only.
- `packages/game/src/<domain>`: shared pure TypeScript catalogs, balance, transitions,
  placement and simulation, with no React or Convex imports. `game/runtime` holds authoritative
  gameplay commands; `builder` holds portable scene-builder operations.
- `packages/backend/convex`: persistence, authentication, permission checks, domain adapters and
  migrations. `jgengine/` wraps `@jgengine/convex` factories; `multiplayer/` wires presence and
  chat. Authoritative gameplay belongs here.

The wallet belongs to the engine profile economy; `packages/backend/convex/currency.ts` adapts
domains still on Convex tables. Move a domain's state and writes together and never split an
atomic gameplay transaction across authorities. One shared world coordinate system covers
players, presence, claims, racks and decorations; claims gate building, not movement.
`undefined` means not loaded and an empty array means loaded and empty.

## Standards

- Keep gameplay math and eligibility rules in `packages/game` and show the costs, capacity
  requirements and blocked-action reasons the server actually enforces. Authenticate and
  authorize every gameplay mutation.
- Preserve saves: idempotent migrations in the owning module, compatibility reads until a
  migration is proven complete. Seeds and hashes that placed saved worlds
  (`packages/game/src/world/cityHash.ts`) must keep their values; its test pins them.
- Regenerate `convex/_generated/` and `src/routeTree.gen.ts` from source and commit them.
- Follow `docs/design/DESIGN.md`: warm miniature-lab styling, one palette, one obvious next
  action, blocked actions explained, costs and duration previewed before spending. Players start
  with money and an empty inventory, never a starter kit.
