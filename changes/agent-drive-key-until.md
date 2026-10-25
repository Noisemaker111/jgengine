### Added

- Drive key steps take `until`: `{ "key": "KeyW", "until": { "is": "__jgProbe().z < -3.5" } }` holds the key until the page expression holds, then releases (`ms` is a minimum, `timeoutMs` caps the hold and fails the step). Engine `drive`, lockstep `--record` and the portable `drive.mjs` all honor it, so a walk to a place no longer depends on how fast the page renders.
