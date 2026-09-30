import { lazy, Suspense, useLayoutEffect, useState, type ComponentProps, type LazyExoticComponent } from "react";

import { suspendPlayControls } from "@jgengine/core/game/controlGate";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { Shell3dPresentation } from "./Shell3dPresentation";
import { markPresentationCodeLoadFailure } from "./presentationRecovery";

type Presentation = typeof Shell3dPresentation;
type Props = ComponentProps<Presentation> & { onPresentationReveal?: () => void };
let loadedPresentation: LazyExoticComponent<Presentation> | undefined;

function getPresentation(): LazyExoticComponent<Presentation> {
  return loadedPresentation ??= lazy(() =>
    import("./Shell3dPresentation").then(
      (module) => ({ default: module.Shell3dPresentation }),
      (error: unknown) => {
        throw markPresentationCodeLoadFailure(error);
      },
    ),
  );
}

function LoadingPresentation({ ctx }: { ctx: GameContext }) {
  useLayoutEffect(() => suspendPlayControls(ctx), [ctx]);
  return (
    <div role="status" aria-live="polite" data-shell-code-loading
      style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", minHeight: 160, background: "#0f172a", color: "#e2e8f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      Loading game view…
    </div>
  );
}

function PresentationReveal({ onReveal }: { onReveal?: () => void }) {
  // React repeats layout effects when a suspended tree becomes visible again.
  useLayoutEffect(() => { onReveal?.(); });
  return null;
}

/** Loads the normal 3D implementation only for a 3D presentation. @internal */
export function LazyShell3dPresentation({ onPresentationReveal, ...props }: Props) {
  const [Presentation] = useState(getPresentation);
  return (
    <Suspense fallback={<LoadingPresentation ctx={props.ctx} />}>
      <Presentation {...props} />
      <PresentationReveal onReveal={onPresentationReveal} />
    </Suspense>
  );
}
