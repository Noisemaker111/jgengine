import type { GenericActionCtx } from "convex/server";
import { makeFunctionReference } from "convex/server";

import type { DataModel } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isBotActorExternalId } from "./botActor";
import { sha256Hex } from "./bots";
import { buildAgentPlaybook } from "./playbook";
import {
  errorResponse,
  unverifiedTokenSubject,
  jsonResponse,
  parseBearerToken,
} from "./playerApiAuth";

const AGENT_API_VERSION = 3;

const getOwnedGameIdInternalRef = makeFunctionReference<
  "query",
  { externalId: string },
  string | null
>("playerInternal:getOwnedGameIdInternal");

type PlayerAuthContext = {
  token: string;
  externalId: string;
  gameId: string;
  actorKind: "owner" | "bot";
};

async function resolveBotActor(
  ctx: GenericActionCtx<DataModel>,
  token: string,
  claimedExternalId: string,
): Promise<PlayerAuthContext | null> {
  const tokenHash = await sha256Hex(token);
  const gameId = await ctx.runMutation(internal.bots.pingBotByToken, {
    actorExternalId: claimedExternalId,
    tokenHash,
  });
  return gameId ? { token, externalId: claimedExternalId, gameId, actorKind: "bot" } : null;
}

async function resolveOwnerActor(
  ctx: GenericActionCtx<DataModel>,
  token: string,
): Promise<PlayerAuthContext | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const externalId = identity.subject;
  const gameId = (await ctx.runQuery(getOwnedGameIdInternalRef, { externalId })) as string | null;
  return gameId ? { token, externalId, gameId, actorKind: "owner" } : null;
}

async function authenticatePlayer(
  ctx: GenericActionCtx<DataModel>,
  request: Request,
): Promise<{ ok: true; player: PlayerAuthContext } | { ok: false; response: Response }> {
  const token = parseBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: errorResponse(
        "Missing Bearer token. The plot owner connects a bot in-game and shares its token, or drives the API with their own session token.",
        401,
      ),
    };
  }

  const claimedExternalId = unverifiedTokenSubject(token);
  const player =
    claimedExternalId !== null && isBotActorExternalId(claimedExternalId)
      ? await resolveBotActor(ctx, token, claimedExternalId)
      : await resolveOwnerActor(ctx, token);
  if (!player) {
    return {
      ok: false,
      response: errorResponse(
        "No world found for this token. Ask the plot owner to connect a bot and start a world.",
        404,
      ),
    };
  }

  return { ok: true, player };
}

/** Public play discovery manifest — GET /agent/api/v1 */
export function buildAgentApiManifest() {
  const playbook = buildAgentPlaybook();
  return {
    api: "llmville-play",
    apiVersion: AGENT_API_VERSION,
    description:
      "Public coding-agent play surface. The plot owner connects one bot in-game and shares its long-lived token; call the same Convex queries and mutations as the web game via POST /api/query and /api/mutation.",
    audience: "coding-agents",
    hiddenFromHumanUi: true,
    playbookUrl: playbook.playbookUrl,
    howToCall: playbook.howToCall,
    start: {
      summary: playbook.summary,
      steps: [
        "Ask the plot owner to open the Bot app in the in-game tablet and Connect a bot; they paste you its token and the agent API base URL.",
        "GET /agent/api/v1/playbook — core loop and full Convex API catalog (no npm install).",
        "POST {convexUrl}/api/mutation with Authorization: Bearer {botToken} and body { path, args, format: \"json\" }.",
        "Query world:state for game.tutorialStage; follow coreLoop in the playbook.",
        "Roam the shared street with worldPresence:syncPlayerPosition and visit open neighbor plots via world:moveToInteriorFromLobby; visits are read-only and offline/banned plots reject you.",
      ],
      example: {
        path: "store:buy",
        args: { itemId: "gpu_1", quantity: 2 },
        note: "Include gameId and the bot actor externalId (bot:<owner>) in args.",
      },
      apiGroups: Object.keys(playbook.api),
    },
    auth: {
      scheme: "Convex bearer token (bot JWT or the owner's own session token)",
      botToken:
        "The plot owner connects a bot via the in-game tablet Bot app and shares the token. One bot per owner; long-lived.",
      humanSession:
        "A signed-in human can drive the API directly with their own Better Auth Convex session token.",
    },
    endpoints: {
      playbook: {
        method: "GET",
        path: "/agent/api/v1/playbook",
        description: "Agent-only: game loop, tutorial hints, and full Convex API catalog.",
      },
      ping: { method: "GET", path: "/agent/api/v1/ping", description: "Verify a bot or owner token" },
    },
  };
}

export type AgentApiManifest = ReturnType<typeof buildAgentApiManifest>;

export const agentApiIndex = httpAction(async () => jsonResponse(buildAgentApiManifest()));

export const agentApiPlaybook = httpAction(async () => jsonResponse(buildAgentPlaybook()));

/** GET /agent/api/v1/ping — verify a bot or owner token */
export const agentApiPing = httpAction(async (ctx, request) => {
  const auth = await authenticatePlayer(ctx, request);
  if (!auth.ok) return auth.response;

  return jsonResponse({
    ok: true,
    externalId: auth.player.externalId,
    gameId: auth.player.gameId,
    actorKind: auth.player.actorKind,
    apiVersion: AGENT_API_VERSION,
  });
});
