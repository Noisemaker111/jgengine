/** One write request the dev save endpoint accepts: a scene document or tunable deltas. */
export type SaveEndpointRequest =
  | { kind: "editor-document"; gameId: string; json: string }
  | {
      kind: "tunables";
      gameId: string;
      deltas: readonly { table: string; key: string; value: unknown }[];
    };

/** Result envelope the dev save endpoint returns for every write request. */
export interface SaveEndpointResponse {
  ok: boolean;
  path?: string;
  applied?: number;
  skipped?: readonly { table: string; key: string; reason: string }[];
  error?: string;
}

/** Where dev-time saves land: the endpoint URL plus the Games/<gameId> directory it targets. */
export interface SaveEndpointInfo {
  url: string;
  gameId: string;
}

const GLOBAL_KEY = "__jgengineSaveEndpoint";

type SaveEndpointGlobal = typeof globalThis & { [GLOBAL_KEY]?: SaveEndpointInfo };

interface ImportMetaEnvLike {
  DEV?: boolean;
  PROD?: boolean;
  NODE_ENV?: string;
}

function readImportMetaEnv(): ImportMetaEnvLike {
  try {
    const meta = import.meta as unknown as { env?: ImportMetaEnvLike };
    return meta.env ?? {};
  } catch {
    return {};
  }
}

function readProcessNodeEnv(): string | undefined {
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return proc?.env?.NODE_ENV;
}

/** True once a bundler or Node marks the build as production — the signal
 * `installSaveEndpoint` refuses to run under, even if a caller forgot its own
 * `import.meta.env.DEV` guard.
 * @internal
 */
export function isProductionEnvironment(): boolean {
  const env = readImportMetaEnv();
  if (env.PROD === true) return true;
  if (env.DEV === true) return false;
  return (env.NODE_ENV ?? readProcessNodeEnv()) === "production";
}

/** Publishes the dev-server save endpoint so editor and devtools UIs show Save buttons.
 * No-ops in a production build even if the caller forgot its own DEV guard.
 * @internal
 */
export function installSaveEndpoint(url: string, gameId: string): () => void {
  if (isProductionEnvironment()) return () => {};
  const root = globalThis as SaveEndpointGlobal;
  const info: SaveEndpointInfo = { url, gameId };
  root[GLOBAL_KEY] = info;
  return () => {
    if (root[GLOBAL_KEY] === info) delete root[GLOBAL_KEY];
  };
}

/** Returns the installed dev save endpoint, or null when saves cannot reach disk.
 * @internal
 */
export function getSaveEndpoint(): SaveEndpointInfo | null {
  return (globalThis as SaveEndpointGlobal)[GLOBAL_KEY] ?? null;
}
