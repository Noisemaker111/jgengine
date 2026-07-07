# @jgengine/shell

Game player shell for [JGengine](https://github.com/Noisemaker111/jgengine): a React Three Fiber canvas with orbit camera + follow feel, input tracking, hotbar/primary-click plumbing, HUD mounting, an error overlay, `GameUiPreview` for staged HUD screenshots, and a demo game. You supply a `GameRegistry` mapping game ids to lazy `PlayableGame` loaders:

```tsx
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { GameRegistry } from "@jgengine/shell/registry";

const games: GameRegistry = {
  "my-game": () => import("./game").then((m) => m.myGame),
};

<GamePlayerShell playable={await games["my-game"]()} />;
```

Peer deps: `react`, `three`, `@react-three/fiber`, `@react-three/drei`, `three-stdlib`. The shell's HUD classes are Tailwind — add an `@source` entry for `node_modules/@jgengine/shell` in your CSS. AGPL-3.0-only.

Weather primitives are available from `@jgengine/shell/weather` for game scene overlays:

```tsx
import { WeatherLayer, LightningStrike } from "@jgengine/shell/weather";

<WeatherLayer mode="rain" intensity={0.8} wind={[1.5, 0, -0.4]} rain={{ count: 7000 }} />;
<LightningStrike origin={[0, 22, 0]} target={[4, 0, -6]} strikeKey={stormTick} />;
```

`RainField` and `SnowField` can also be mounted directly. The primitives use camera-following instanced volumes, prop-driven density controls, shared time/wind uniforms under `WeatherLayer`, and explicit Three resource disposal. They were shaped from ideas in achrefelouafi's MIT [RainSystemThreeJS](https://github.com/achrefelouafi/RainSystemThreeJS) and [SnowSystemThreeJS](https://github.com/achrefelouafi/SnowSystemThreeJS) references (see [CREDITS.md](../../CREDITS.md)) without bringing over GUI, audio, postprocessing, or app-specific scene setup.

## Water

`@jgengine/shell/water` renders the Gerstner ocean surface from `@jgengine/core`:

```tsx
import { Ocean } from "@jgengine/shell/water";

<Ocean />;
```

Summed Gerstner waves, crest-driven foam, and Fresnel water color were shaped from achrefelouafi's MIT [OceanThreejs](https://github.com/achrefelouafi/OceanThreejs) reference (see [CREDITS.md](../../CREDITS.md)).

## Structures

`GeneratedBuilding` renders the seeded facade/roof kit produced by `generateBuilding` in `@jgengine/core`:

```tsx
import { GeneratedBuilding } from "@jgengine/shell/structures/GeneratedBuilding";
import { generateBuilding } from "@jgengine/core/world/buildings";

<GeneratedBuilding building={generateBuilding({ seed: "block-a", floors: 6 })} />;
```

The component vocabulary (windows, awnings, AC units, clotheslines, storefronts, shutters, store signs, roof props, guardrails) and placement logic follow achrefelouafi's MIT [BuildingGeneratorThreeJS](https://github.com/achrefelouafi/BuildingGeneratorThreeJS) (see [CREDITS.md](../../CREDITS.md)).

## Terrain primitives

`@jgengine/shell/terrain` exports R3F helpers for shell-local natural scenes:

```tsx
import { GrassField, ProceduralGround, createProceduralTerrainSampler } from "@jgengine/shell/terrain";

const terrain = { seed: "meadow", size: 48, height: 0.9 };
const heightAt = createProceduralTerrainSampler(terrain);

<>
  <ProceduralGround terrain={terrain} />
  <GrassField area={48} heightAt={heightAt} density={0.65} />
</>;
```
