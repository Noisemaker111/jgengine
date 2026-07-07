export interface QteStep {
  id: string;
  action: string;
  windowStart: number;
  windowEnd: number;
}

export interface QteInputEvent {
  action: string;
  at: number;
}

export type QteOutcome =
  | { status: "success" }
  | { status: "fail"; atStep: string; reason: "missed-window" | "wrong-action" | "too-early" };

export function evaluateQteSequence(
  steps: readonly QteStep[],
  inputs: readonly QteInputEvent[],
): QteOutcome {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const input = inputs[index];
    if (input === undefined) return { status: "fail", atStep: step.id, reason: "missed-window" };
    if (input.at < step.windowStart) return { status: "fail", atStep: step.id, reason: "too-early" };
    if (input.at > step.windowEnd) return { status: "fail", atStep: step.id, reason: "missed-window" };
    if (input.action !== step.action) return { status: "fail", atStep: step.id, reason: "wrong-action" };
  }
  return { status: "success" };
}

export function pendingQteStep(steps: readonly QteStep[], elapsedSeconds: number): QteStep | null {
  return (
    steps.find((step) => elapsedSeconds >= step.windowStart && elapsedSeconds <= step.windowEnd) ?? null
  );
}

export function qteProgress(steps: readonly QteStep[], elapsedSeconds: number): number {
  if (steps.length === 0) return 1;
  const passed = steps.filter((step) => elapsedSeconds > step.windowEnd).length;
  return passed / steps.length;
}
