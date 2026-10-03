### Migrate

- Custom asset import files now require safe relative POSIX paths, printable roles and plain JSON metadata; `classifyAssetFile` returns `null` for unknown bytes even when the filename has a supported extension.

### Fixed

- Validate untrusted custom asset specs and preserve independent game-owned metadata; detect GLB/glTF, KTX2, MP3, WOFF2 and HDR formats from bytes with malformed/truncated header checks.
