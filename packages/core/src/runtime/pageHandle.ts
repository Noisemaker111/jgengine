/**
 * Everything a running game publishes on the page for agents, captures and devtools, as one object:
 * `window.__jg`. Each owner adds its own field to {@link JgPage} by declaration merging and publishes
 * it with {@link publishOnPage}, which hands back the removal; when the last field goes, `__jg` goes
 * too, so a closed game leaves the page as it found it.
 *
 * ```ts
 * declare module "@jgengine/core/runtime/pageHandle" { interface JgPage { audio?: AudioProbe } }
 * const unpublish = publishOnPage("audio", probe);
 * ```
 */
export interface JgPage {}

declare global {
  var __jg: JgPage | undefined;
}

/** Put `value` at `window.__jg[key]`; the returned function removes it, unless something replaced it since. */
export function publishOnPage<K extends keyof JgPage>(key: K, value: NonNullable<JgPage[K]>): () => void {
  const page = (globalThis.__jg ??= {});
  page[key] = value;
  return () => {
    const current = globalThis.__jg;
    if (current === undefined || current[key] !== value) return;
    delete current[key];
    if (Object.keys(current).length === 0) Reflect.deleteProperty(globalThis, "__jg");
  };
}

export function onPage<K extends keyof JgPage>(key: K): JgPage[K] | undefined {
  return globalThis.__jg?.[key];
}

export function publishReadout<K extends keyof JgPage>(key: K, value: NonNullable<JgPage[K]>): () => void {
  return publishOnPage(key, value);
}
