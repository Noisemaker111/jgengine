### Fixed

- `downloadArchive` (`@jgengine/assets/download`) is typed as the `ArrayBuffer`-backed `Uint8Array` it returns, so its bytes are accepted where a `fetch` body is expected.
