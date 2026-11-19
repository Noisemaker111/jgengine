export function parseTrustedOriginsEnv(raw = process.env["TRUSTED_ORIGINS"]): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isLocalDevSite(site: string): boolean {
  try {
    const { hostname } = new URL(site);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return site.includes("localhost") || site.includes("127.0.0.1");
  }
}

export function isLocalDevBrowserOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      && (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

const PRODUCTION_SITE_ORIGINS = ["https://llmville.com", "https://www.llmville.com"] as const;

export function staticTrustedOrigins(site: string, fromEnv = parseTrustedOriginsEnv()): string[] {
  const productionDefaults = isLocalDevSite(site) ? [] : PRODUCTION_SITE_ORIGINS;
  return Array.from(new Set([site, ...productionDefaults, ...fromEnv]));
}

export function createTrustedOriginsResolver(site: string) {
  const localDev = isLocalDevSite(site);
  const baseOrigins = staticTrustedOrigins(site);

  return async (request: Request | undefined): Promise<string[]> => {
    if (!localDev || !request) {
      return baseOrigins;
    }

    const origin = request.headers.get("origin");
    if (!origin || !isLocalDevBrowserOrigin(origin)) {
      return baseOrigins;
    }

    return Array.from(new Set([...baseOrigins, origin]));
  };
}
