export type FeedWriteGate = {
  allowedActions: readonly string[];
};

export function createFeedWriteGate(allowedActions: readonly string[] = []): FeedWriteGate {
  return { allowedActions: [...allowedActions] };
}

export function validateFeedWrite(
  gate: FeedWriteGate | undefined,
  action: string,
): { ok: true } | { ok: false; reason: string } {
  if (gate === undefined || gate.allowedActions.length === 0) {
    return { ok: false, reason: "client feed writes are disabled" };
  }
  if (!gate.allowedActions.includes(action)) {
    return { ok: false, reason: `feed action not allowed: ${action}` };
  }
  return { ok: true };
}
