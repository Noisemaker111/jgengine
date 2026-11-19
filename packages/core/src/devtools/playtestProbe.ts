import { publishOnPage } from "../runtime/pageHandle";

type Probe = () => Record<string, number>;
declare module "../runtime/pageHandle" {
  interface JgPage {
    probe?: Probe;
  }
}

/** @internal Attach a live capture probe for one shell boot; cleanup retires retained readers. */
export function attachPlaytestProbe(read: Probe): () => void {
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
  const unpublish = publishOnPage("probe", probe);
  return () => {
    active = false;
    unpublish();
  };
}
