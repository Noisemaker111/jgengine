/**
 * `@jgengine-examples/studios` — copyable example studios built entirely on the public #809/#812 seam.
 * None of this is engine code; each module registers a studio with a single call and zero engine
 * edits. Import {@link registerExampleStudios} once from a game/app to light them up in the editor
 * (`+ Add → Studios`, auto-generated slider inspectors) and at runtime (via `AuthoredScene`).
 */
export * from "./poleLineStudio";
export * from "./bookcaseStudio";
export { registerPoleLineRenderer } from "./poleLineRenderer";

import { registerBookcaseStudio } from "./bookcaseStudio";
import { registerPoleLineRenderer } from "./poleLineRenderer";
import { registerPoleLineStudio } from "./poleLineStudio";

/** Register every example studio (scene kinds + renderers + generators). Call once at app startup. */
export function registerExampleStudios(): void {
  registerPoleLineStudio();
  registerPoleLineRenderer();
  registerBookcaseStudio();
}
