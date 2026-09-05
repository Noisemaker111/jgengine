import type { TemplateFile, TemplateOptions } from "./types";

/** Add a connected shared-world composition to the standard editor-backed game scaffold. */
export function sharedBuilderFiles(files: TemplateFile[], options: TemplateOptions): TemplateFile[] {
  const packageFile = files.find(file => file.path === "package.json")!;
  const pkg = JSON.parse(packageFile.contents);
  pkg.dependencies["@jgengine/convex"] = options.variant === "in-repo" ? "workspace:*" : `^${options.engineVersion}`;
  pkg.dependencies.convex = "^1.42.2";
  pkg.scripts["dev:backend"] = "convex dev";
  const replaced = files.map(file => {
    if (file.path === "package.json") return { ...file, contents: JSON.stringify(pkg, null, 2) + "\n" };
    if (file.path === "src/game.config.ts") return { ...file, contents:
      'import { convex, servers } from "@jgengine/core/runtime/adapter";\n' + file.contents.replace("  simulation:", '  multiplayer: servers({ topology: "shared", adapter: convex() }),\n  features: { chat: true },\n  simulation:') };
    return file;
  });
  const additions: TemplateFile[] = [
    { path: "convex/schema.ts", contents: `import { defineSchema } from "convex/server";
import { jgengineTables } from "@jgengine/convex/server";
export default defineSchema(jgengineTables());
` },
    { path: "convex/gameRuntime.ts", contents: `import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { chunkKeysAround } from "@jgengine/core/runtime/worldChunks";
import { markPlayerDirty } from "@jgengine/core/runtime/snapshot";
import { claimTerritory, planFootprintClaims } from "@jgengine/core/world/territory";
import { accrueSince } from "@jgengine/core/time/accrueSince";
import { applyCurrencyOperation } from "@jgengine/core/economy/currency";

export const GAME_ID = ${JSON.stringify(options.id)};
export const cash = { id: "cash", name: "Cash", symbol: "$", decimals: 3 };
const territory = { gapCells: 1, currency: cash.id, price: (owned: number) => 1 + owned };
function cell(input: unknown) {
  const value = input as { x?: unknown; z?: unknown } | null;
  if (!value || typeof value.x !== "number" || typeof value.z !== "number" || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.z)) throw new Error("Choose a valid cell");
  return { x: value.x, z: value.z };
}
export const runtime = createGameRuntime({
  gameId: GAME_ID, topology: "shared", save: { auto: "60s", scope: "player+chunks" },
  loop: {
    joinScope: userId => ({ players: [userId], chunkKeys: [] }),
    onNewPlayer(ctx) {
      const player = ctx.snapshot.players[ctx.player.userId]!;
      if (ctx.player.isNew) player.economy.cash = 100;
      player.session = { ...player.session, incomeAt: ctx.nowMs };
    },
  },
  commands: {
    claim: {
      scope(input) { const target = cell(input); return { players: "actor", chunkKeys: chunkKeysAround([target.x, 0, target.z], 1) }; },
      validate(snapshot, input, actor) { const plan = planFootprintClaims(snapshot, actor, [cell(input)], territory); return plan.ok ? null : { reason: plan.reason }; },
      apply(snapshot, input, actor, nowMs) { const result = claimTerritory(snapshot, actor, [cell(input)], { ...territory, nowMs }); if (!result.ok) throw new Error(result.reason); return result.snapshot; },
    },
    accrue: {
      scope: () => ({ players: "actor", chunkKeys: [] }),
      validate: () => null,
      apply(snapshot, _input, actor, nowMs) {
        const player = snapshot.players[actor]!;
        const elapsed = accrueSince(Number(player.session?.incomeAt ?? nowMs), nowMs, { capMs: 60000 });
        const adjustment = applyCurrencyOperation(cash, player.economy.cash ?? 0, "add", elapsed.elapsedSeconds * 0.005);
        if (!adjustment.success) throw new Error(adjustment.reason);
        return markPlayerDirty({ ...snapshot, players: { ...snapshot.players, [actor]: {
          ...player, economy: { ...player.economy, cash: adjustment.newBalance }, session: { ...player.session, incomeAt: elapsed.anchorMs },
        } } }, actor);
      },
    },
  },
});
` },
    { path: "convex/runtime.ts", contents: `import { createGameServerFunctions } from "@jgengine/convex/server";
import { runtime } from "./gameRuntime";
export const { joinServer, leaveServer, runCommand, getServer, getServerMeta, getServerCapacity, getPlayerProfile, getChunks, getFeed, pushFeedEntry, flushSave, flushDirtyServers, tickActiveServers, helpers } = createGameServerFunctions({ runtimes: [runtime], auth: "anonymous" });
` },
    { path: "convex/presence.ts", contents: `import { createPresenceFunctions } from "@jgengine/convex/server";
export const { list, sync, leave, reapIdlePresence } = createPresenceFunctions({ auth: "anonymous" });
` },
    { path: "convex/chat.ts", contents: `import { createChatFunctions } from "@jgengine/convex/server";
export const { sendMessage, messages, pruneChatMessages } = createChatFunctions({ auth: "anonymous" });
` },
    { path: "convex/leaderboard.ts", contents: `import { createLeaderboardFunctions } from "@jgengine/convex/server";
export const { getTop, getProfile, incrementMany } = createLeaderboardFunctions({ auth: "anonymous" });
` },
    { path: "convex/online.ts", contents: `import { internalMutationGeneric, makeFunctionReference, type FunctionReference, type MutationBuilder } from "convex/server";
import { v } from "convex/values";
import { forEachOnlinePlayer, type JGDataModel, type OnlinePlayer } from "@jgengine/convex/server";
import { helpers } from "./runtime";
const mutation = internalMutationGeneric as MutationBuilder<JGDataModel, "internal">;
const batchRef = makeFunctionReference("online:batch") as unknown as FunctionReference<"mutation", "internal", { players: OnlinePlayer[]; nowMs: number }>;
const scanRef = makeFunctionReference("online:scan") as unknown as FunctionReference<"mutation", "internal", { cursor: string | null; nowMs: number }>;
export const scan = mutation({
  args: { cursor: v.union(v.string(), v.null()), nowMs: v.number() },
  handler: (ctx, args) => forEachOnlinePlayer(ctx, { ...args, batchSize: 25, handler: batchRef, continuation: scanRef }),
});
export const start = mutation({ args: {}, handler: ctx => forEachOnlinePlayer(ctx, { batchSize: 25, handler: batchRef, continuation: scanRef }) });
export const batch = mutation({
  args: { players: v.array(v.object({ serverId: v.string(), userId: v.string(), homeGameId: v.optional(v.string()) })), nowMs: v.number() },
  handler: async (ctx, args) => {
    for (const player of args.players) await helpers.runCommand(ctx, { serverId: player.serverId, actorUserId: player.userId, command: "accrue", input: {} });
  },
});
` },
    { path: "convex/crons.ts", contents: `import { cronJobs, makeFunctionReference } from "convex/server";
import { jgengineCronSpecs } from "@jgengine/convex/server";
import { runtime } from "./gameRuntime";
const crons = cronJobs();
for (const spec of jgengineCronSpecs({ runtimes: [runtime], chat: true })) crons.interval(spec.name, { seconds: spec.intervalSeconds }, makeFunctionReference<"mutation">(spec.module + ":" + spec.functionKey), {});
crons.interval("online income", { seconds: 10 }, makeFunctionReference<"mutation">("online:start"), {});
export default crons;
` },
    { path: "src/main.tsx", contents: `import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { resolveConvexMultiplayer } from "@jgengine/convex/resolveConvexMultiplayer";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";
const root = createRoot(document.getElementById("root")!);
const url = import.meta.env.VITE_CONVEX_URL;
if (!url) root.render(<main className="p-8 text-white">Connect this world to continue. See README.md for setup.</main>);
else {
  const client = new ConvexReactClient(url);
  const userId = localStorage.getItem("jg-user") ?? crypto.randomUUID();
  localStorage.setItem("jg-user", userId);
  const multiplayer = resolveConvexMultiplayer({ game: game.game, gameId: ${JSON.stringify(options.id)}, client, userId });
  root.render(<ConvexProvider client={client}><GameHost playable={game} multiplayer={multiplayer}${options.editor === false ? "" : ' editor={() => import("@jgengine/editor")}'} /></ConvexProvider>);
}
` },
    { path: "src/game/ui/GameUI.tsx", contents: `import { ChatPanel } from "@jgengine/react/chat";
export function GameUI() {
  return <div className="pointer-events-auto absolute bottom-4 left-4 w-80 rounded-lg bg-slate-950/90 p-3 text-white"><ChatPanel initialChannel="global" defaultExpanded={false} ownMessageClassName="text-cyan-300" logClassName="max-h-48 overflow-auto" /></div>;
}
` },
    { path: "README.md", contents: `# Shared world setup

Run bun run dev:backend, select a Convex project, and copy its URL to VITE_CONVEX_URL in .env.local. Then run bun dev.
The scaffold uses explicit anonymous development identities; wire production authentication before opening the world to public users.

The runtime declares shared topology, scoped claim/accrue commands, fractional cash precision, and actor-only joins. Presence queries use the viewer chunk, chat is rate-limited, and the online pipeline schedules batches of 25. Claiming a cell validates and pays through the territory primitive. Author buildable objects in the editor, then use placeWithTerritory for placement.

Before content, write the first-hour balance sheet and prove the first tutorial verb works from spawn. The demo starts with 100 cash and income of 0.005 per second; replace those game-owned values deliberately. Keep costs visible at the placement cursor and display rejected commands.

The standard CSS scans engine React and shell packages, including ChatPanel and JoinGate. Verify their rendered styling after changing Tailwind sources. Production budgets need a crowd test of command and presence read sets.
` },
  ];
  const paths = new Set(additions.map(file => file.path));
  return [...replaced.filter(file => !paths.has(file.path)), ...additions];
}
