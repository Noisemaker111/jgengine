import { NextResponse } from "next/server";

import { toServerListing } from "@jgengine/core/runtime/hostPersistence";

import { gameIdFrom, getPersistence } from "../../../lib/persistence";

export async function GET(request: Request) {
  const persistence = await getPersistence();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const records = await persistence.listServers(gameIdFrom(request.url));
  const listings = records
    .map(toServerListing)
    .filter((listing) => listing.status === "running")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
  return NextResponse.json(listings);
}
