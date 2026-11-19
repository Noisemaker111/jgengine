/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ComponentType, ReactNode } from "@jgengine/core/ui/jsx";

import { HudOverlayHost, HudThemeRoot } from "@jgengine/core/hud/hudThemeRoot.view";
import { HudViewportProvider } from "@jgengine/core/hud/hudViewport.view";
import { ShellNotices, ShellUiCues } from "@jgengine/core/notifications/ShellNotices.view";
import { useAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings.view";
import { kitHudBridge, UiKitRoot } from "@jgengine/core/ui/kit/uiKitRoot.view";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";
import { useGameContext } from "@jgengine/ui/provider";

/**
 * The dev app's demos show the engine's DOM HUD parts, which read the HUD theme, the kit and the notice
 * feed. Games draw on Rune and the shell mounts no DOM chrome, so the dev app, a tool, wraps its own
 * demos in it.
 */
function withDomChrome(playable: PlayableGame): PlayableGame {
  const GameUI: ComponentType = playable.GameUI;
  function DemoUI(): ReactNode {
    const ctx = useGameContext();
    const accessibility = useAccessibilitySettings();
    const kit = playable.uiKit ?? null;
    const body = (
      <>
        <GameUI />
        <ShellNotices ctx={ctx} config={playable.chrome?.notices} scale={1} />
        <HudOverlayHost {...(kit === null ? {} : { style: kitHudBridge("dialog") })} />
      </>
    );
    return (
      <HudViewportProvider platforms={playable.controls?.platforms} config={playable.controls?.hudFit}>
        <ShellUiCues ctx={ctx} enabled={playable.audio?.hudCues !== false}>
          <HudThemeRoot theme={playable.hudTheme} accessibility={accessibility}>
            {kit === null ? body : <UiKitRoot kit={kit}>{body}</UiKitRoot>}
          </HudThemeRoot>
        </ShellUiCues>
      </HudViewportProvider>
    );
  }
  return { ...playable, GameUI: DemoUI };
}

/** Every demo in the registry, loaded with its DOM chrome around its GameUI. */
export function demosWithDomChrome(registry: GameRegistry): GameRegistry {
  return Object.fromEntries(Object.entries(registry).map(([id, load]) => [id, () => load().then(withDomChrome)]));
}
