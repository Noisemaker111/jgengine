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

- This folder (`src/`): the engine's UI runtime (`@jgengine/core/ui/jsx`), Vite and Convex adapters;
  no React and no third-party React libraries. Domain UI lives in `<domain>/components/` and draws
  with the engine's kit parts (`KitPanel`, `KitButton`, `KitMeter`, `KitToast`); LLMville's look is
  its UI kit in `src/kit/` (palette tokens, card shells, icons, stylesheet). `src/runtime` holds
  browser and UI adapters only.
- Screens: `src/screens/screens.tsx` lists every screen by path; `screenRouter.tsx` moves between
  them (`navigate`, `ScreenLink`) over the engine's menu stack. Refused actions raise a notice through
  `runtime/actionFeedback.ts`; dragging uses the engine's drag layer; fonts ship in `src/art/fonts`.
- Two hosts mount it. Its own site (`main.tsx`) keeps each screen at its URL. The dev runner lists
  it as `llmville`: `?game=llmville` boots the world (`src/index.tsx`), `?game=llmville&preview`
  opens the whole site with the screen in `&screen=`, and `&preview=racks|character|hud|bills` opens
  one dev screen (`src/preview.tsx`). `?ui=rune` draws either through Rune.
- `packages/game/src/<domain>`: shared pure TypeScript catalogs, balance, transitions,
  placement and simulation, with no React or Convex imports. `game/runtime` holds authoritative
  gameplay commands.
- `src/editor.scene.json`: authored world content, edited through the JGengine editor. The endless
  datacenter, claims, racks and build items are runtime-owned and declared in
  `src/scene-ownership.json`.
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
- Regenerate `convex/_generated/` from source and commit it.
- Follow `docs/design/DESIGN.md`: warm miniature-lab styling, one palette, one obvious next
  action, blocked actions explained, costs and duration previewed before spending. Players start
  with money and an empty inventory, never a starter kit.
