import { NextResponse } from "next/server";

import { gameIdFrom, getPersistence } from "../../../../lib/persistence";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const persistence = await getPersistence();
  return NextResponse.json(
    await persistence.getLeaderboardProfile({ gameId: gameIdFrom(request.url), userId }),
  );
}
