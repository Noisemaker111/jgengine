### Fixed

- A terrain without a `waterLevel` no longer paints the detail shader's beach sand band. Previously the band defaulted to water at height 0, so any flat terrain near 0 (a park, a meadow) rendered as beach; six reference games set `detail.waterLevel` far below the world only to avoid it. Set `waterLevel` on the terrain or `detail.waterLevel` to keep a shoreline.
