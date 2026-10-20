### Fixed

- Atomic vitals bars (`HealthBar`, `ManaBar`, … in `@jgengine/react`) cap their frame at a quarter of the bar height, so thin bars (e.g. `height: "4px"`) show their fill instead of only the two 2px frame lines.
