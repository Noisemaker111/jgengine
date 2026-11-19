/**
 * Package root — deep-path imports only for engine APIs (`@jgengine/core/<domain>/<file>`).
 * Re-exports {@link VERSION} so `import { VERSION } from "@jgengine/core"` works. The release notes
 * are about 1 MB, so they load only from their own entry point when asked for.
 */
export { VERSION } from "./meta/version";
