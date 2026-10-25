import { createObservableKeyedStore } from "@jgengine/core/store/observableKeyedStore";
import type { MeasuredMeshBounds } from "@llmville/game/world/assetFrame";

function boundsEqual(left: MeasuredMeshBounds, right: MeasuredMeshBounds): boolean {
  return (
    Math.abs(left.width - right.width) < 0.001
    && Math.abs(left.height - right.height) < 0.001
    && Math.abs(left.depth - right.depth) < 0.001
    && Math.abs(left.minY - right.minY) < 0.001
    && Math.abs(left.center[0] - right.center[0]) < 0.001
    && Math.abs(left.center[1] - right.center[1]) < 0.001
    && Math.abs(left.center[2] - right.center[2]) < 0.001
  );
}

const store = createObservableKeyedStore<MeasuredMeshBounds>(boundsEqual);

export function registerModelBounds(modelPath: string, bounds: MeasuredMeshBounds): void {
  store.set(modelPath, bounds);
}

export function getCachedModelBounds(modelPath: string): MeasuredMeshBounds | undefined {
  return store.get(modelPath);
}

export function subscribeModelBounds(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getModelBoundsSnapshot(): ReadonlyMap<string, MeasuredMeshBounds> {
  return store.mapSnapshot();
}
