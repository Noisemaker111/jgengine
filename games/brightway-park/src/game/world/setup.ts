import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { registerBuildCommands } from "../build/commands";
import { restorePark, savePark } from "../persistence";
import { resetPark } from "../parkReset";
import { session } from "../session";
import { traceNative, tracePark } from "../evidence";

const cleanups = new WeakMap<GameContext, () => void>();

export function disposeWorld(ctx: GameContext): void {
  savePark(ctx);
  cleanups.get(ctx)?.();
  cleanups.delete(ctx);
}

export { seedPlacements, type SeedPlacement } from "../parkReset";

export function setupWorld(ctx: GameContext): void {
  resetPark(ctx, { seed: false });
  registerBuildCommands(ctx);
  if (!restorePark(ctx)) {
    // No save, or one from an older build: a new park, keeping the line that says why.
    const status = session.saveStatus;
    resetPark(ctx);
    session.saveStatus = status;
  }
  ctx.time.pause();
  if (typeof localStorage !== "undefined") {
    try { ctx.game.store.set("park.reduced-motion",localStorage.getItem("brightway-park.reduced-motion")==="true"); } catch { /* Browser storage may be disabled. */ }
  }
  if (typeof window !== "undefined") {
    const abort = new AbortController();
    cleanups.set(ctx, () => abort.abort());
    window.addEventListener("pagehide", () => savePark(ctx), { signal: abort.signal });
    if (import.meta.env.DEV && import.meta.env.VITE_PARK_EVIDENCE === "1") {
      tracePark(ctx,"boot");
      window.addEventListener("keydown",e=>traceNative("keyboard",{code:e.code,key:e.key,target:(e.target as HTMLElement)?.tagName}),{capture:true,signal:abort.signal});
      window.addEventListener("error",e=>traceNative("runtime-error",{message:e.message,file:e.filename,line:e.lineno}),{signal:abort.signal});
      window.addEventListener("unhandledrejection",e=>traceNative("runtime-rejection",String(e.reason)),{signal:abort.signal});
    }
  }
  session.saveStatus = session.saveStatus || "Saved on builds, ticket changes, pause and day close";
}
