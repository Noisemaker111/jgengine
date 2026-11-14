/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGameContext } from "@jgengine/ui/provider";

import { hudStore } from "../hudStore";
import { preferences } from "../preferences";
import { CommandMenu, FieldSettings } from "./CommandMenu";
import { RtsHud } from "./Hud";
import { Text, WaxSeal, useHudSlice } from "./kit";
import { lawnTheme, GAME_FONTS, WAX } from "./theme";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

/** LAWN ORDER's garden journal on one native Rune surface: the field HUD, the front end and the notice feed. */
export function GameUI() {
  const ctx = useGameContext();
  const settings = useSettings();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const theme = useMemo(() => lawnTheme(prefs), [prefs.largeText, prefs.highContrast, prefs.reducedMotion]);
  const phase = useHudSlice((h) => h.phase);
  const { width, height } = useRuneViewport();
  const [mapOpen, setMapOpen] = useState(false);
  // At most the three newest reports, so a burst of hazard beats and coach tips never buries the field.
  const notices = useMemo(() => {
    let cache: ReturnType<typeof ctx.game.notices.list> = [];
    let key = "";
    return {
      read: () => {
        const next = ctx.game.notices.list().slice(-3);
        const nextKey = next.map((n) => n.id).join(",");
        if (nextKey !== key) { key = nextKey; cache = next; }
        return cache;
      },
      subscribe: ctx.game.notices.subscribe,
    };
  }, [ctx]);
  const field = phase === "playing" || phase === "paused";

  // Escape is the field desk's own key in a running battle; a held battle resumes through the dispatch case's back action.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented || settings.isOpen) return;
      if (hudStore.get().phase === "playing") { event.preventDefault(); ctx.game.commands.run("match.pause", {}); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ctx, settings.isOpen]);

  const pause = field ? <RuneAction label={phase === "playing" ? "Pause battle" : "Resume battle"} radius={32} hover="#ffffff22" press="#00000033"
    command={{ name: phase === "playing" ? "match.pause" : "match.resume" }}><WaxSeal size={58} emblem="pause" /></RuneAction> : null;

  return <RuneRoot context={ctx} theme={theme}>
    {phase === "ready" ? null : <RtsHud ctx={ctx} width={width} height={height} pause={pause} mapOpen={mapOpen} toggleMap={() => setMapOpen(!mapOpen)} />}
    <CommandMenu ctx={ctx} width={width} height={height} />
    {settings.isOpen ? <RuneView anchor="fill" fill="#1a120ae0" modal onBack={settings.close}>
      <RuneView anchor="center" gap={8} items="end" maxHeight={height - 24} scroll>
        <RuneAction label="Close settings" run={settings.close} variant="plank"><Text textStyle="gilt" text="Close ×" /></RuneAction>
        <FieldSettings ctx={ctx} width={Math.min(520, width - 24)} />
      </RuneView>
    </RuneView> : null}
    {/* The pause menu and the title speak for themselves: the field's reports only show in battle. */}
    <RuneView anchor="top" safe inset={width < 700 ? 180 : 96} gap={6} items="center" maxWidth={Math.min(520, width - 24)} hidden={phase !== "playing"}>
      <RuneTransient source={notices} expire={ctx.game.notices.prune}>{(notice) =>
        <RuneView variant="note" padding={[6, 14, 6, 14]}><Text align="center" text={notice.text} {...(notice.tone === "deny" ? { color: WAX } : {})} /></RuneView>}
      </RuneTransient>
    </RuneView>
  </RuneRoot>;
}
