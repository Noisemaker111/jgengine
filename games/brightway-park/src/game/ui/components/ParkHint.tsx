import { useEffect } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { currentHint } from "../../onboarding";

const POINTED = "data-bw-pointed";

/** The first control in the list that is on screen now. */
function onScreen(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * The first scenario's next step from the engine's onboarding: a card that says what to do and a
 * ring on the control that does it. The world arrow for a spot on the lot is drawn by the world
 * overlay from the same step. "Hide hints" skips the rest.
 */
export function ParkHint() {
  const { commands } = useGame();
  const ctx = useGameContext();
  // The engine touches the store on every step change; the id is all that re-renders the card.
  const id = useGameStore((c) => currentHint(c)?.id ?? null);
  const step = id === null ? null : currentHint(ctx);
  useEffect(() => {
    if (step === null) return undefined;
    let pointed: HTMLElement | null = null;
    // Panels open and close under the hint, so look again a few times a second.
    const point = () => {
      const next = onScreen(step.ui);
      if (next === pointed) return;
      pointed?.removeAttribute(POINTED);
      next?.setAttribute(POINTED, "");
      pointed = next;
    };
    point();
    const timer = setInterval(point, 250);
    return () => { clearInterval(timer); pointed?.removeAttribute(POINTED); };
    // The step's id names its selectors; a new step re-points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (step === null) return null;
  return <KitPanel className="bw-onboard" data-onboarding-step={step.id} eyebrow="Next step" role="status"
    aside={<KitButton variant="ghost" size="sm" aria-label="Hide the hints" onClick={() => commands.run("onboarding.skip", {})}>Hide hints</KitButton>}>{step.text}</KitPanel>;
}
