/** Loopback fixture listeners; isolated development hosts use distinct declared ports. */
export function fixturePorts(env: Record<string, string | undefined>): { frontend: number; realm: number } {
  function port(name: string, fallback: number): number {
    const value = env[name];
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer port between 1 and 65535`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`${name} must be an integer port between 1 and 65535`);
    return parsed;
  }
  const frontend = port("JG_FIXTURE_FRONTEND_PORT", 4624);
  const realm = port("JG_FIXTURE_REALM_PORT", 4625);
  if (frontend === realm) throw new Error("Fixture frontend and realm ports must differ");
  return { frontend, realm };
}
