---
name: jgengine-ui
description: Build game-owned Rune UI from native layout, live bindings, interactions, flow and theme primitives.
---

# JGengine UI

## Rune UI, no CSS

Game UI draws through Rune. Set `uiRenderer: "rune"` in `defineGame` and use the
engine JSX runtime. No React, Solid, game CSS, class names, style strings or DOM
elements. Start a TSX file with `/** @jsxImportSource @jgengine/core/ui/jsx */`.
The engine supplies primitives, not finished screens, HUDs, bars or inventories.
Games own their composition, words, visual identity and game-specific panels.
The temporary CSS mirror serves unmigrated games; do not extend it.

Import rendered primitives from `@jgengine/core/ui/rune/primitives.view` and
models/bindings from `@jgengine/core/ui/rune/primitives`.

- `RuneRoot`: one native surface, typed `theme`, optional game `context`,
  `safeArea: [top,right,bottom,left]`, `project` and `localise` injections.
- `RuneView`: `layout="stack|row|grid"`, `columns`, `gap`, `scroll`, `anchor`,
  `safe`, `inset`, `variant`, and `responsive={{phone: {...}, tablet: {...}}}`.
  Anchors position within the nearest parent; a root child anchors to the screen.
- `RuneLabel`: `value={bind(read)}`, `format`, `textStyle`, translated `message`
  with `params`, and `rich` spans (UTF-8 byte ranges, native colors/fonts).
  `RuneGlyph` takes SVG `artwork`; SVG is artwork, never a CSS declaration.
- `RuneAction`: `command={{name,input}}` or `run`, automatic native focus and
  navigation, `disabled`, `holdMs`, `tooltip`, `onHover`, `onDrag`, `dragValue`
  and `acceptDrop`. A hold activates once on a sufficiently long release.
  Direction keys navigate native bounds; `onAdjust` consumes left/right on a value.
  Mouse, touch, keyboard and pad share activation and the top capture scope.
- `RuneField`: controlled native text entry: `value`, `onChange`, `onSubmit`,
  `placeholder`, `multiline`, `secret`, `maxLength`, `variant`, `textStyle`. Rune owns
  caret/selection/IME; a focused field takes every key until Escape or Tab, and touch
  devices raise the phone keyboard. Clear a chat line by setting `value` to `""`.
- `RuneFor`: subscribed `source: {read,subscribe}`, stable `keyBy`, render function.
  `read` returns the same bounded collection until a structural change; per-frame
  item fields bind to their leaves. Do not subscribe the whole UI to a frame store.
- `createRuneFlow`: screen/modal/overlay routes with `pause` and `capture` policy;
  `push/pop/replace/clear`, `read/subscribe`, `snapshot/restore`. `RuneLayers`
  presents the stack, owns pause/input leases and finite enter/exit transitions.
  Screen layers cover earlier screens; modal/overlay layers compose above them.
- `RuneTransient`: source records with `id`/`expiresAt`, `expire` and optional
  injected `now`. One deadline timer, no idle polling. Use the existing bounded
  `ctx.game.notices` feed for messages and author their contents yourself.
  `RuneWorldAnchor` projects an `entity` or `position` with an optional world
  `offset`; inject the camera projection at the root. Compose it with transient
  records for damage numbers or world messages. It queries only its target.

`RuneTheme` contains game-owned `colors`, named `text` styles, native `variants`
and `motion: {duration,distance,bounce}`. No theme preset or widget vocabulary.
The one `RuneStyle` set maps directly to Rune: points or `{fraction}` sizes,
min/max sizes, padding, gap, pin, grow/shrink, justify/items, columns, fill,
gradient, radial, radius, border, shadow, blur, clip, opacity, x/y/scale,
hover/press, motion and polygon shape. Text adds family, size, weight, color,
tracking, mono and align. Every native visual prop accepts `bind(() => value)`.
Numeric/text slots and addressed property patches never render components.
Use `runeFormat`, `runeTween` and `runePulse` for formatting, finite value motion
and a change pulse. Native `motion` handles changed geometry/paint.

## A game UI in a page

These are game components: the health fill and bag composition are not engine widgets.
`ctx` supplies the game's registered commands; the game passes its existing stat getter
and subscribed collection. `theme` supplies its own look.

```tsx
/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { bind, createRuneFlow, type RuneSource, type RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { RuneRoot, RuneView, RuneLabel, RuneAction, RuneFor, RuneLayers } from "@jgengine/core/ui/rune/primitives.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
type Item = { id: string; name: string };
export function GameUI({ ctx, theme, health, bag }: {
  ctx: GameContext; theme: RuneTheme; health: () => number; bag: RuneSource<Item>;
}) {
  const flow = useMemo(() => {
    const f = createRuneFlow({
      title: {layer: "screen", pause: true, capture: true},
      pause: {layer: "modal", pause: true, capture: true},
      bag: {layer: "modal", pause: false, capture: true},
    });
    f.push("title"); return f;
  }, []);
  return <RuneRoot context={ctx} theme={theme}>
    <RuneView anchor="bottom-left" safe inset={20} width={220} gap={8}>
      <RuneLabel value={bind(health)} format={n => `Health ${Math.ceil(n)}`} />
      <RuneView height={6} fill={theme.colors["track"]}>
        <RuneView height={6} width={bind(() => ({fraction: health()/100}))}
          fill={theme.colors["accent"]} />
      </RuneView>
      <RuneAction run={() => flow.push("bag")}>Bag</RuneAction>
      <RuneAction run={() => flow.push("pause")}>Pause</RuneAction>
    </RuneView>
    <RuneLayers flow={flow}>{entry =>
      <RuneView anchor="center" variant="surface" gap={12}>
        <RuneLabel value={entry.kind} textStyle="heading" />
        {entry.kind === "bag" ?
          <RuneFor source={bag} keyBy={item => item.id}>{item =>
            <RuneAction command={{name: "equip", input: {id: item.id}}}>
              {item.name}
            </RuneAction>}
          </RuneFor> : <RuneAction run={() => flow.clear()}>Play</RuneAction>}
        <RuneAction run={() => flow.pop()}>Back</RuneAction>
      </RuneView>}
    </RuneLayers>
  </RuneRoot>;
}
```

## Adoption and proof

Delete the game's old UI folder and CSS after preserving its commands and data
adapters. Set `uiRenderer: "rune"`, mount `RuneRoot` with its theme, compose screens
from the primitives, and rebuild game-only panels. Deepward's UI is a real adopter;
its settings controls compose the existing `useSettings` controller. Save/load
continues using the game's existing persistence model. Fonts register with
`registerNativeRuneFont` before mounting.

Headless PNG check uses the real game component and production Rune builder:

```
bun games/deepward/proofs/runeUiFixture.tsx title /tmp/ui.json 1280 720
cd native
cargo run -p jg-ui --example native-png -- /tmp/ui.json /tmp/ui.png 1280 720 crates/jg-hud/assets/sharetechmono_ShareTechMono-Regular.ttf crates/jg-hud/assets/rajdhani_Rajdhani-SemiBold.ttf
```

Repeat at `390 844`, inspect the PNGs, and cover the HUD, a menu and settings.
`RuneViewport` injects deterministic dimensions. These are UI-only captures,
not whole-game screenshots. After Rust changes run `bun scripts/build-jg-ui-wasm.ts`.
On PC, `drive deepward --flow ui-tour` checks real settings and confirms
`window.__jgNativeUi.stats().frames` stops on a settled page. GPU/CPU timings
come from the PC acceptance step, using the production perf harness.

Next-game gaps: inject each camera's world projection and safe-area insets;
provide subscribed slices for existing collections; compose game-specific settings
editors (rebinding), chat transcripts and minimap content from these pieces, with
`RuneField` for any typed text. The API provides anchors, a frame and a text field,
not a camera adapter or map renderer.
Do not retain DOM panels inside a native subtree to cover those gaps.

For visual direction use [reference.md](reference.md); gameplay state remains with
the owning systems. Existing DOM games retain the migration-era recipes in
[reference-primitives.md](reference-primitives.md) until their own conversion.
Search [api.md](api.md) and [capabilities.md](capabilities.md) for other shared parts.
Use [jgengine-verify](../jgengine-verify/SKILL.md) for real-game behavior and captures.
