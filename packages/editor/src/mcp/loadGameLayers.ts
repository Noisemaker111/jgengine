/** Node-only: resolve a game's `editorLayers` export straight from Games/<id>/src. */
export async function loadGameLayers(gameId: string): Promise<unknown> {
  try {
    const path = new URL(`../../../../Games/${gameId}/src/editorLayers.ts`, import.meta.url);
    const mod = (await import(path.href)) as { editorLayers?: unknown };
    if (typeof mod.editorLayers === "function") return (mod.editorLayers as () => unknown)();
    return mod.editorLayers;
  } catch {
    return undefined;
  }
}
