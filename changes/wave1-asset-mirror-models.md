Closes #2837

### Added

- Rocketbox and Khronos model-library pulls try the `packs` release first (`model-library-<name>.zip`, or `JGENGINE_ASSETS_MIRROR`) and fall back to api.github.com only when the mirror lacks the entry.
- `scripts/mirror-assets.ts` builds one zip per Rocketbox or Khronos entry from the real source and uploads it; `workflow_dispatch` takes a `model` input.

### Fixed

- A 403 saying the session's GitHub access is not enabled is reported as a sandbox policy denial naming the entry, not as a transient error.
