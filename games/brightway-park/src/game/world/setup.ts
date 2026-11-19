import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { registerBuildCommands } from "../build/commands";
import { loadParkProfile, restorePark, savePark } from "../persistence";
import { resetPark } from "../parkReset";
import { armMidnight } from "../midnight";
import { sessionOf } from "../session";
import { traceNative, tracePark } from "../evidence";
import { ContextMap } from "@jgengine/core/runtime/contextIdentity";
import { perContext } from "@jgengine/core/runtime/perContext";

const cleanups = new ContextMap<() => void>();

export function disposeWorld(ctx: GameContext): void {
  void savePark(ctx);
  cleanups.get(ctx)?.();
  cleanups.delete(ctx);
}

export { seedPlacements, type SeedPlacement } from "../parkReset";

const boot = perContext(() => ({ ready: Promise.resolve() }));

export function parkReady(ctx: GameContext): Promise<void> {
  return boot(ctx).ready;
}

async function openSavedPark(ctx: GameContext): Promise<void> {
  await loadParkProfile(ctx);
  if (!(await restorePark(ctx))) return;
  ctx.time.pause();
  armMidnight(ctx);
}

export function setupWorld(ctx: GameContext): void {
  // A new park until the saved one (if any) is read.
  resetPark(ctx);
  registerBuildCommands(ctx);
  boot(ctx).ready = openSavedPark(ctx);
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
  sessionOf(ctx).saveStatus = sessionOf(ctx).saveStatus || "Saved on builds, ticket changes, pause and day close";
}
