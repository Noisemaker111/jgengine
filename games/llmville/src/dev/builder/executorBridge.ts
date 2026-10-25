/**
 * Dev-only HMR bridge letting HTTP requests hitting the Vite dev server reach
 * the live BuilderStore in this tab — see `builderExecutorApiPlugin` in
 * `llmville/vite.devPlugins.ts` for the server side of this protocol.
 * Guarded by `import.meta.hot`, which only exists in dev, so this is a no-op
 * in a production build.
 */
import type { ViteHotContext } from "vite/types/hot.d.ts";

import { buildSceneDigest } from "@llmville/game/builder/sceneDigest";

import { BuilderStore } from "@/dev/builder/builderStore";
import { enumerateCallableMethods, executeToolCalls } from "@/dev/builder/executor";

type ExecutorBridgeRequest =
  | { id: number; kind: "call"; method: string; args: unknown[] }
  | { id: number; kind: "scene" }
  | { id: number; kind: "listMethods" };
type ExecutorBridgeResponse = { id: number; ok: boolean; payload: unknown };

declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    "llmville:executor:request": ExecutorBridgeRequest;
    "llmville:executor:response": ExecutorBridgeResponse;
  }
}

let started = false;

async function handle(hot: ViteHotContext, request: ExecutorBridgeRequest): Promise<void> {
  try {
    let payload: unknown;
    if (request.kind === "listMethods") {
      payload = enumerateCallableMethods();
    } else if (request.kind === "scene") {
      const state = BuilderStore.getState();
      payload = {
        digest: buildSceneDigest(state.mapData, [...state.selectedRefs]),
        mapData: state.mapData,
      };
    } else {
      const [result] = await executeToolCalls(
        [{ method: request.method, args: request.args }],
        { allowedMethods: enumerateCallableMethods() },
      );
      payload = result;
    }
    hot.send("llmville:executor:response", { id: request.id, ok: true, payload });
  } catch (error) {
    hot.send("llmville:executor:response", {
      id: request.id,
      ok: false,
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Idempotent: safe to call from every BuildWorkbench mount. No-op outside dev (production build, no HMR). */
export function startExecutorBridge(): void {
  if (started || !import.meta.hot) return;
  started = true;
  const hot = import.meta.hot;

  hot.on("llmville:executor:request", (request) => {
    void handle(hot, request);
  });
}
