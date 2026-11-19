import { publishOnPage } from "../runtime/pageHandle";

/** What the page is covering while it loads: the screen's label, its progress (0-1) when known. */
export interface LoadingCoverReading {
  label: string;
  progress: number | null;
}

declare module "../runtime/pageHandle" {
  interface JgPage {
    /** Present exactly while a loading screen or warmup cover hides the game; captures and checks wait on it. */
    loading?: { covers: () => readonly LoadingCoverReading[] };
  }
}

const covers = new Map<symbol, LoadingCoverReading>();
let unpublish: (() => void) | null = null;

/**
 * Report a loading cover as shown until the returned function is called. The page carries
 * `window.__jg.loading` while any cover is up and drops it when the last one goes, so a tool asks the
 * page whether it is loading instead of looking for a DOM element a Rune screen does not have.
 */
export function showLoadingCover(reading: LoadingCoverReading): { update(next: LoadingCoverReading): void; hide(): void } {
  const key = Symbol("loading-cover");
  covers.set(key, reading);
  unpublish ??= publishOnPage("loading", { covers: () => [...covers.values()] });
  return {
    update(next) {
      if (covers.has(key)) covers.set(key, next);
    },
    hide() {
      if (!covers.delete(key) || covers.size > 0) return;
      unpublish?.();
      unpublish = null;
    },
  };
}

/** Whether any loading cover is up on this page. */
export function loadingCovered(): boolean {
  return covers.size > 0;
}
