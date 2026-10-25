### Fixed

- World model triggers now also check at the start of a stepped tick, so a value an event or `set` pushed to a threshold between ticks (a grip knocked to exactly 0) fires its trigger before calming nudges it back.
