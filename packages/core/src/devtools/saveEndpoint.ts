import { onPage, publishOnPage } from "../runtime/pageHandle";

export type SaveEndpointRequest =
  | { kind: "editor-document"; gameId: string; json: string }
  | {
      kind: "tunables";
      gameId: string;
      deltas: readonly { table: string; key: string; value: unknown }[];
    };

export interface SaveEndpointResponse {
  ok: boolean;
  path?: string;
  applied?: number;
  skipped?: readonly { table: string; key: string; reason: string }[];
  derivedSkipped?: number;
  error?: string;
}

export interface SaveEndpointInfo {
  url: string;
  gameId: string;
}

declare module "../runtime/pageHandle" {
  interface JgPage {
    saveEndpoint?: SaveEndpointInfo;
  }
}

/** @internal */
export interface BuildEnv {
  DEV?: boolean;
  PROD?: boolean;
  NODE_ENV?: string | undefined;
  VITE_JGENGINE_DEV_PROXY?: string | undefined;
}

/**
 * Read the bundler's build flags. Each member is named literally: Vite replaces exactly
 * `import.meta.env.<NAME>`, and its server-side module runner throws on any other use of
 * `import.meta.env` (a whole-object read breaks server rendering). Off Vite, `import.meta.env`
 * may be missing, so the read is guarded. @internal
 */
export function readBuildEnv(): BuildEnv {
  try {
    return {
      // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
      DEV: import.meta.env.DEV,
      // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
      PROD: import.meta.env.PROD,
      // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
      NODE_ENV: import.meta.env.NODE_ENV,
      // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
      VITE_JGENGINE_DEV_PROXY: import.meta.env.VITE_JGENGINE_DEV_PROXY,
    };
  } catch {
    return {};
  }
}

function readProcessNodeEnv(): string | undefined {
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return proc?.env?.NODE_ENV;
}

/** @internal */
export function isProductionEnvironment(): boolean {
  const env = readBuildEnv();
  if (env.PROD === true) return true;
  if (env.DEV === true) return false;
  return (env.NODE_ENV ?? readProcessNodeEnv()) === "production";
}

/** @internal */
export function installSaveEndpoint(url: string, gameId: string): () => void {
  if (isProductionEnvironment()) return () => {};
  return publishOnPage("saveEndpoint", { url, gameId });
}

/** Returns the installed dev save endpoint, or null when saves cannot reach disk.
 * @internal
 */
export function getSaveEndpoint(): SaveEndpointInfo | null {
  return onPage("saveEndpoint") ?? null;
}
