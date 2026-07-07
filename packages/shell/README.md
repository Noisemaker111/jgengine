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

`RainField` and `SnowField` can also be mounted directly. The primitives use camera-following instanced volumes, prop-driven density controls, shared time/wind uniforms under `WeatherLayer`, and explicit Three resource disposal. They were shaped from ideas in achrefelouafi's MIT RainSystemThreeJS and SnowSystemThreeJS references without bringing over GUI, audio, postprocessing, or app-specific scene setup.

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
