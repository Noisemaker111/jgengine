/**
 * Package root — deep-path imports only for engine APIs (`@jgengine/core/<domain>/<file>`).
 * Re-exports {@link VERSION} / {@link CHANGELOG} so `import { VERSION } from "@jgengine/core"` works.
 */
export { VERSION, CHANGELOG, type ChangelogEntry } from "./meta/changelog";
