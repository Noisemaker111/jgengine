/**
 * `@jgengine-examples/studios` — copyable example studios built entirely on the public #809/#812 seam.
 * None of this is engine code; each module registers a studio with a single call and zero engine
 * edits. Import {@link registerExampleStudios} once from a game/app to light them up in the editor
 * (`+ Add → Studios`, auto-generated slider inspectors) and at runtime (via `AuthoredScene`).
 *
 * The former pole-line example graduated into the engine for studio/editor parity (#1101):
 * `@jgengine/core/world/poleLineKind` + the shell's `PoleLineRenderer` — every editor session can
 * author poles/cables with no wiring.
 */
export * from "./bookcaseStudio";

import { registerBookcaseStudio } from "./bookcaseStudio";

/** Register every example studio (scene kinds + renderers + generators). Call once at app startup. */
export function registerExampleStudios(): void {
  registerBookcaseStudio();
}
