import { afterEach, beforeEach } from "bun:test";

// Every test file in a `bun test` run shares one global object. A file that stubs `window` and then
// puts it back by assignment (`globalThis.window = previous` where `previous` was undefined) leaves an
// own `window` key holding undefined; a later file that only stubs `window` when the key is missing
// then runs with no window at all (#3194: Harbor Heat's play test failed with
// "undefined is not an object (evaluating 'window.addEventListener')" whenever an earlier file in its
// shard leaked). This guard puts the browser globals back between files: when the first test of a
// new file starts, a global still exactly as the previous file's last test left it, and different
// from how the run started, was leaked by that file and is restored, with a warning naming the file.
// A global the new file's own module code set is a different value, so it is kept.
// Limits: the guard runs at the new file's first test, so the new file's module-level code still sees
// the leak (stub in beforeEach, as Harbor Heat's play test does), and a leak made in a file's own
// afterAll comes after the guard's last look at that file. Restore by descriptor in tests regardless.
// bunfig.toml preloads this for `bun test` at the root; each package's `test` script passes it too.

/** Browser globals tests stub; bun itself defines only `navigator` and `fetch` among them. */
export const GUARDED_GLOBALS = [
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "MutationObserver",
  "matchMedia",
  "Image",
  "FontFace",
  "AudioContext",
  "RTCPeerConnection",
  "createImageBitmap",
  "fetch",
] as const;

type Snapshot = Map<string, PropertyDescriptor | undefined>;

function snapshot(): Snapshot {
  return new Map(GUARDED_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
}

/** Two descriptors name the same global state: both absent, or the same value and accessors. */
export function sameGlobal(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.value === b.value && a.get === b.get && a.set === b.set;
}

const baseline = snapshot();
let currentFile: string | null = null;
let leftByLastTest: Snapshot | null = null;

beforeEach(() => {
  if (Bun.main === currentFile) return;
  const previousFile = currentFile;
  currentFile = Bun.main;
  if (leftByLastTest === null) return;
  const leaked: string[] = [];
  for (const [name, left] of leftByLastTest) {
    const now = Object.getOwnPropertyDescriptor(globalThis, name);
    const start = baseline.get(name);
    if (!sameGlobal(now, left) || sameGlobal(now, start)) continue;
    if (start === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, start);
    leaked.push(name);
  }
  if (leaked.length > 0) console.warn(`test-globals: ${previousFile} left ${leaked.join(", ")} changed; restored before ${currentFile}`);
});

afterEach(() => {
  leftByLastTest = snapshot();
});
