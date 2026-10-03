### Fixed

- Standalone `jgengine shoot` / `drive` wait for a declared capture-readiness handshake instead of accepting a canvas while the host is still loading. Legacy pages fail readiness when their canvas stays undersized or has an empty backing store.
