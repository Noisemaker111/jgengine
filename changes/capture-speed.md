### Added

- `withGraphicsQualityOverride` and `parseGraphicsQuality` (`@jgengine/core/settings/graphicsSettings`) pin a graphics tier for one session without persisting it.
- The player shell reads `?quality=<tier>` and pins that tier for the page. `bun run shoot`/`drive --quality draft` use it (low tier, half size) for fast iteration shots; `--quality full` stays the default for PR evidence.
