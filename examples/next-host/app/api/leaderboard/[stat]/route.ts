import { NextResponse } from "next/server";

import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";

import { gameIdFrom, getPersistence } from "../../../../lib/persistence";

function isScope(value: string): value is LeaderboardScope {
  return value === "global" || value === "server" || value === "profile";
}

export async function GET(request: Request, context: { params: Promise<{ stat: string }> }) {
  const { stat } = await context.params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "global";
  if (!isScope(scope)) {
    return NextResponse.json({ error: "scope must be global | server | profile" }, { status: 400 });
  }
  const persistence = await getPersistence();
  const serverId = url.searchParams.get("serverId") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  return NextResponse.json(
    await persistence.getLeaderboardTop({
      gameId: gameIdFrom(request.url),
      stat,
      scope,
      serverId,
      limit: limitParam === null ? undefined : Number(limitParam),
    }),
  );
}
