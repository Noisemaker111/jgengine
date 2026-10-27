import { useEffect } from "react";
import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { currentHint } from "../../onboarding";
import { usePark } from "../usePark";

const POINTED = "data-bw-pointed";

/** The first control in the list that is on screen now. */
function onScreen(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * The first scenario's next step: a card that says what to do and a ring on the control that does
 * it. The world arrow for a spot on the lot is drawn by the world overlay from the same step.
 */
export function ParkHint() {
  const w = usePark();
  const step = currentHint(w);
  const id = step?.id ?? null;
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
  return <KitPanel className="bw-onboard" data-onboarding-step={step.id} eyebrow="Next step" role="status">{step.text}</KitPanel>;
}
