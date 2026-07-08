export interface DevProxyTable {
  readonly [routeName: string]: string;
}

export interface ProxiedUrlOptions {
  dev?: boolean;
  table?: DevProxyTable;
  prefix?: string;
}

interface ImportMetaEnvLike {
  DEV?: boolean;
  VITE_JGENGINE_DEV_PROXY?: string;
}

function readImportMetaEnv(): ImportMetaEnvLike {
  try {
    const meta = import.meta as unknown as { env?: ImportMetaEnvLike };
    return meta.env ?? {};
  } catch {
    return {};
  }
}

export function parseDevProxyTable(raw: string | undefined): DevProxyTable {
  if (raw === undefined || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export const DEFAULT_DEV_PROXY_PREFIX = "/proxy";

export function proxiedUrl(target: string, options: ProxiedUrlOptions = {}): string {
  const env = readImportMetaEnv();
  const dev = options.dev ?? env.DEV === true;
  if (!dev) return target;

  const table = options.table ?? parseDevProxyTable(env.VITE_JGENGINE_DEV_PROXY);
  const prefix = options.prefix ?? DEFAULT_DEV_PROXY_PREFIX;

  for (const [routeName, base] of Object.entries(table)) {
    if (target.startsWith(base)) {
      return `${prefix}/${routeName}${target.slice(base.length)}`;
    }
  }
  return target;
}
