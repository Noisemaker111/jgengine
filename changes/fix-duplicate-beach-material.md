The material library has one `ground/beach` entry again.

Part of #2837

### Fixed

- The material library lists `ground/beach` once; Harbor Heat's and the terrain pass's entries for the same Ground033 scan both landed.
- The ambientCG source list has one `Ground033` entry; the same two passes each added it, which failed the shipped-manifest check.
