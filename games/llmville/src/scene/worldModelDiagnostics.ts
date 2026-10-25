import { useSyncExternalStore } from "react";

import { createObservableKeyedStore } from "@jgengine/core/store/observableKeyedStore";

export interface WorldModelDiagnostic {
  key: string;
  label: string;
  modelPath: string;
  message: string;
}

function diagnosticsEqual(previous: WorldModelDiagnostic, next: WorldModelDiagnostic): boolean {
  return (
    previous.label === next.label
    && previous.modelPath === next.modelPath
    && previous.message === next.message
  );
}

const store = createObservableKeyedStore<WorldModelDiagnostic>(diagnosticsEqual);

export function subscribeToWorldModelDiagnostics(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getWorldModelDiagnosticsSnapshot(): readonly WorldModelDiagnostic[] {
  return store.arraySnapshot();
}

export function reportWorldModelDiagnostic(diagnostic: WorldModelDiagnostic): void {
  store.set(diagnostic.key, diagnostic);
}

export function clearWorldModelDiagnostic(key: string): void {
  store.delete(key);
}

export function useWorldModelDiagnostics(): readonly WorldModelDiagnostic[] {
  return useSyncExternalStore(
    subscribeToWorldModelDiagnostics,
    getWorldModelDiagnosticsSnapshot,
    getWorldModelDiagnosticsSnapshot,
  );
}
