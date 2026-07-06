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
