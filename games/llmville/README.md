# LLMville

A cosy co-op AI-lab tycoon in one shared multiplayer world: buy GPUs, collect data, train
models, serve tokens for income and grow your lab next to other players and their LLM bots.
Live at [llmville.com](https://llmville.com).

LLMville is a three-part app rather than a single Vite game: this folder is the React web
client (TanStack Router, React Three Fiber), `packages/game` is the shared pure game logic
(`@llmville/game/*`, imported by both sides) and `packages/backend` is the Convex backend
(accounts through Better Auth, world state, the authoritative gameplay mutations).

## Design checklist

Every price, rate and requirement below lives in `packages/game/src/` (catalogs and balance)
and is enforced by the Convex mutations in `packages/backend/convex/`.

- **Core loop.** Buy a rack ($200) and place it, which founds your plot; buy GPUs (GTX 1060,
  $480) and install them in rack slots; dedicate each GPU to a job - collect data (scrape
  books, +125 data tokens per 10 s per card), train models, or serve a revealed model; a served
  model earns money every tick from tokens/second x money/token over the TFLOPs and VRAM you
  gave it (the first model is about $200 an hour).
- **Progression.**
  - [x] Data tokens research better hardware, from the GTX 1070 (75 tokens) to the
        GB200 NVL72 (27,000 tokens), plus water-cooled racks and rack coolers.
  - [x] Base models unlock by licence or data (Alpaca 1 for $200, Alpaca 2 at 5,000 data);
        each fine-tune commits 1x to 4x the minimum data and rolls the model's stats on reveal.
  - [x] Placing more items grows the plot's tiled footprint; upgrades and store tiers unlock.
  - [x] A 9-step first-model tutorial and a shared "neighborhood of makers" goal (5 labs).
- **Failure states.** Nothing kills a lab: money is the risk. Utility and rent bills arrive
  daily and monthly with a grace period, then accrue late fees and APR; a model nobody serves
  earns $0, and served income decays as the global frontier benchmark rises (~0.5 a day).
- **Minute 5 -> hour 5.** At 5:00 one rack holds two GTX 1060s, one scraping and one serving
  the first fine-tuned model at about $200/hr. By hour 5 research has bought faster cards,
  several models share the TFLOP pool between training and serving, and bills and the daily
  market decide which models are worth keeping on.
- **References it is chasing.**
  - *Stardew Valley* - feel: a cosy plot that grows one placed piece at a time.
  - *Factorio* - density: every machine is busy on a job you assigned and its output is visible.
  - *Cookie Clicker* - progression: numbers that compound into the next unlock tier.
- **Gap to target.** No sound at all; tok/s readouts in the model deck print unrounded
  floats; the camera is a fixed close top-down view; bots need the agent REST API and a key.

Loop proof: llmville-first-model (needs a running Convex backend and a signed-in account; see Develop)

## Develop

From the repository root, after `bun install --frozen-lockfile`:

```sh
# 1. Backend: a local Convex deployment with no account (state lives in packages/backend/.convex)
cd llmville/packages/backend
CONVEX_AGENT_MODE=anonymous bunx convex dev --typecheck disable
#    once, in another shell:
CONVEX_AGENT_MODE=anonymous bunx convex env set BETTER_AUTH_SECRET <any 64 hex chars>
CONVEX_AGENT_MODE=anonymous bunx convex env set SITE_URL http://localhost:3001

# 2. Web: llmville/.env.local holds VITE_CONVEX_URL=http://127.0.0.1:3210 and
#    VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
bun --cwd=games/llmville run dev        # http://localhost:3001 (strict port: auth trusts it)
```

Sign up with any test email on the local backend, or play as a guest. `bun run games:test` and
`bun run games:check-types` at the root cover the web client, `@llmville/game` and the Convex
functions.

`/dev/*` routes are visual workbenches (`/dev/tablet`, `/dev/build`, `/dev/city`,
`/dev/city-3d`, `/dev/garage`, `/dev/floorplan`, `/dev/hud`, `/dev/racks`, `/dev/bills`,
`/dev/character`); they render the same components and catalogs as the game.

## Where the code lives

- `packages/game/src/<domain>/` - catalogs, balance, placement and simulation, no React or Convex.
- `src/<domain>/` - the web client's domain UI (`components/`) and runtime adapters.
- `packages/backend/convex/` - schema, auth, permissions and gameplay: `models.ts` (unlock,
  training, stat rolls), `serving.ts` and `world.ts` (income and the world read-model),
  `inference.ts` (GPU job assignment), `frontier.ts`, `dailyMarket.ts`, `market.ts` (economy),
  `bills.ts` (bills). `jgengine/` wraps the `@jgengine/convex` factories; `multiplayer/` wires
  presence and chat.

## Deployment

Production (llmville.com on Cloudflare Workers, Convex `adorable-oriole-506`) still deploys
from the `master` branch of `Noisemaker111/LLMville`. Nothing in this repository deploys
LLMville yet; `wrangler.jsonc` here is kept for the day deploys move.

## Shared-world storage upgrade

From `packages/backend`, run each internal migration against the intended deployment until it
reports `remaining: false`:

```sh
bunx convex run --prod datacenter:migrateLegacyClaims '{}'
bunx convex run --prod multiplayer/worldChat:migrateLegacyMessages '{}'
bunx convex run --prod clientErrors:migrateLegacyReports '{}'
```

Omit `--prod` for a development deployment. Each is a manual one-shot, not a cron; batches move
at most 128 rows and read at most 2 MiB, and a retry continues without duplicating rows. Only
when all three source tables are empty remove `datacenterClaims`, `worldChatMessages` and
`clientErrorReports` from the schema along with these migration exports.
