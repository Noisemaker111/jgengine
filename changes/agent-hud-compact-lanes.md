### Fixed

- `HudCanvas` lane blocks reach the real right and bottom edges on compact displays. The lane frame and block sizes were measured in on-screen pixels and then placed inside the canvas zoom, so with `compactScale={0.86}` blocks stopped about 116 px short of the right edge at 844x390 and 52 px short on a 390x844 phone. They are now measured in the HUD's own pixels.
