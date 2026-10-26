type Probe = () => Record<string, number>;
type ProbeHost = { __jgProbe?: Probe };

/** @internal Attach a live capture probe for one shell boot; cleanup retires retained readers. */
export function attachPlaytestProbe(host: object, read: Probe): () => void {
  const target = host as ProbeHost;
  let active = true;
  const probe = () => {
    if (!active) return {};
    try {
      const value = read();
      return value !== null && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
  target.__jgProbe = probe;
  return () => {
    active = false;
    if (target.__jgProbe === probe) delete target.__jgProbe;
  };
}
