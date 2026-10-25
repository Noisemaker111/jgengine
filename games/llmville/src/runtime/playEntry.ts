/** Search param: user tapped Play / New Lab and must sign in before entering the lab. */
export type PlayEntryIntent = "play";

export function parsePlayEntryIntent(raw: unknown): PlayEntryIntent | undefined {
  return raw === "play" ? "play" : undefined;
}

/** Where auth should land after sign-in — one play pipeline through founder setup. */
export function destinationAfterAuth(intent: PlayEntryIntent | undefined) {
  return intent === "play" ? ({ to: "/game/create" } as const) : ({ to: "/" } as const);
}
