# @jgengine/rapier

Rapier-backed physics adapter for the `@jgengine/core` `PhysicsBackend` seam.
It provides native capsules, shapecasts, rotation, CCD, joints, and collision queries.

```ts
import { createRapierBackend } from "@jgengine/rapier";

const physics = await createRapierBackend();
```

Part of [JGengine](https://github.com/Noisemaker111/jgengine). Apache-2.0.
