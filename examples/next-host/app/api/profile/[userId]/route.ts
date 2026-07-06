import { NextResponse } from "next/server";

import { gameIdFrom, getPersistence } from "../../../../lib/persistence";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const persistence = await getPersistence();
  const profile = await persistence.loadProfile({ userId, gameId: gameIdFrom(request.url) });
  return NextResponse.json(
    profile === null
      ? null
      : {
          userId: profile.userId,
          gameId: profile.gameId,
          playerState: profile.playerState,
          updatedAt: profile.updatedAt,
        },
  );
}
