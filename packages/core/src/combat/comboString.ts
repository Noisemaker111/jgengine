import { type AnimationState, type FramePhase } from "./animationState";

export interface ComboStep {
  id: string;
  clip: string;
  cancelInto?: readonly string[];
  cancelPhases?: readonly FramePhase[];
  stance?: string;
}

export interface ComboString {
  id: string;
  entry: string;
  steps: readonly ComboStep[];
}

const DEFAULT_CANCEL_PHASES: readonly FramePhase[] = ["cancel"];

export function stepById(combo: ComboString, stepId: string): ComboStep | null {
  return combo.steps.find((step) => step.id === stepId) ?? null;
}

export interface AdvanceComboInput {
  combo: ComboString;
  currentStepId: string | null;
  requestedStepId: string;
  phases: readonly FramePhase[];
  stance?: string;
}

export type AdvanceComboResult =
  | { accepted: true; step: ComboStep }
  | { accepted: false; reason: "unknown-step" | "not-chainable" | "wrong-stance" | "window-closed" };

function stanceMatches(step: ComboStep, stance: string | undefined): boolean {
  return step.stance === undefined || step.stance === stance;
}

export function advanceCombo(input: AdvanceComboInput): AdvanceComboResult {
  const { combo, currentStepId, requestedStepId, phases, stance } = input;
  const requested = stepById(combo, requestedStepId);
  if (requested === null) return { accepted: false, reason: "unknown-step" };

  if (currentStepId === null) {
    if (requestedStepId !== combo.entry) return { accepted: false, reason: "not-chainable" };
    if (!stanceMatches(requested, stance)) return { accepted: false, reason: "wrong-stance" };
    return { accepted: true, step: requested };
  }

  const current = stepById(combo, currentStepId);
  if (current === null) return { accepted: false, reason: "unknown-step" };
  if (!(current.cancelInto ?? []).includes(requestedStepId)) {
    return { accepted: false, reason: "not-chainable" };
  }
  if (!stanceMatches(requested, stance)) return { accepted: false, reason: "wrong-stance" };

  const cancelPhases = current.cancelPhases ?? DEFAULT_CANCEL_PHASES;
  if (!cancelPhases.some((phase) => phases.includes(phase))) {
    return { accepted: false, reason: "window-closed" };
  }
  return { accepted: true, step: requested };
}

export interface ComboRunner {
  currentStep(): string | null;
  request(stepId: string, stance?: string): AdvanceComboResult;
  reset(): void;
}

/**
 * Advance a chained melee string from timed inputs, tracking the current step and its cancel/continue windows.
 *
 * @capability combo-chain advance a chained melee string from timed button inputs
 */
export function createComboRunner(combo: ComboString, anim: AnimationState): ComboRunner {
  let current: string | null = null;

  return {
    currentStep() {
      return current;
    },
    request(stepId, stance) {
      const result = advanceCombo({
        combo,
        currentStepId: current,
        requestedStepId: stepId,
        phases: anim.phases(),
        stance,
      });
      if (result.accepted) {
        current = result.step.id;
        anim.play(result.step.clip);
      }
      return result;
    },
    reset() {
      current = null;
    },
  };
}
