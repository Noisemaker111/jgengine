Scenes that came up blank now draw: ember-command's battlefield was white and briarcrown's was a flat beige on a cold load, and the load guard now fails a blank scene.

### Fixed

- A shadow-casting light whose shadow map no frame had drawn yet left every lit draw failing (WebGL: "Mismatch between texture format and sampler type"), so the scene showed only its clear colour. The shader warmup holds the frame's draws behind the loading cover, and cascaded shadows took the first held frame as their one refresh, so far cascades never got a map. A cascade now refreshes until it has a map, or when something asks for a redraw.
- The warmup's own draws ran before any shadow map existed, so every lit warmup draw failed and finished nothing. The first warmup draw now makes the missing maps, and the next real frame redraws them with every caster. WebGL errors on a cold load drop from 230-250 per game to under 50.

### Changed

- `bun run shoot --load --guard` reads the scene canvas back over the two seconds after scene ready and fails a scene that shows fewer than 40 coarse colours: `ember-command: the scene drew blank at scene ready (13 colours; 251 WebGL errors logged)`. Drawn scenes show 80-240; plain beta's ember-command and briarcrown showed 11-18 and fail. Each run also logs its colour count and WebGL error count.
- Baselines re-recorded for all 17 games now that every scene draws (a scene whose draws all failed loaded faster than a real one).
