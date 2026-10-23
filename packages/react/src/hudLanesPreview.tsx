import { HudFrame } from "./hudFrame";
import { HudSurface } from "./hudSurface";
import { HudThemeRoot } from "./hudThemeRoot";
import { HudCanvas, HudPanel, useHudLayout } from "./hudLayout";

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "var(--jg-text-dim, rgba(255,255,255,0.62))", fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/**
 * The same shape Deepward's top-left HUD uses — two blocks that used to arrange
 * themselves into each other. Both declare `lane="status"`, so the shell stacks
 * them; the second lane sits beside the first and the right-hand lane mirrors it.
 * Screenshots at any viewport without a block landing on a neighbour.
 *
 * @capability hud-lanes two HUD blocks stacked in one lane, plus a second lane beside it
 */
export function HudLanesPreview({ className }: { className?: string }) {
  const layout = useHudLayout();
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "radial-gradient(ellipse at 30% 20%, #3b5a46, #1b2a24 55%, #0f1714)",
      }}
    >
      <HudThemeRoot>
        <HudCanvas layout={layout} editChord={false}>
          <HudPanel id="vitals" lane="status" anchor="top-left" width={260} height={104}>
            <HudFrame title="Warden · Lv 12" padding={10}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Chip label="HP" value="78 / 100" />
                <Chip label="MP" value="50 / 80" />
                <Chip label="Lantern" value="burning" />
              </div>
            </HudFrame>
          </HudPanel>
          <HudPanel id="quest-log" lane="status" anchor="top-left" order={1} width={260} height={132}>
            <HudSurface title="Expedition" padding={10}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Chip label="Reach the drowned keep" value="1 / 3" />
                <Chip label="Recover the tide sigil" value="0 / 1" />
                <Chip label="Return to camp" value="—" />
              </div>
            </HudSurface>
          </HudPanel>
          <HudPanel id="party" lane="roster" anchor="top-left" width={190} height={248}>
            <HudSurface title="Party" padding={10}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Chip label="Mara" value="Stable" />
                <Chip label="Osk" value="Wounded" />
                <Chip label="Bel" value="Stable" />
                <Chip label="Tallow" value="Missing" />
              </div>
            </HudSurface>
          </HudPanel>
          <HudPanel id="radar" lane="radar" anchor="top-right" width={180} height={180}>
            <HudSurface title="Survey" padding={10}>
              <div
                style={{
                  height: 122,
                  borderRadius: 999,
                  border: "1px solid var(--jg-slot-border, rgba(255,255,255,0.2))",
                  background: "radial-gradient(circle at 50% 50%, rgba(120,200,160,0.24), rgba(0,0,0,0.35))",
                }}
              />
            </HudSurface>
          </HudPanel>
          <HudPanel id="hint" lane="radar" anchor="top-right" order={1} width={180} height={64}>
            <HudSurface padding={10}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Chip label="Hold" value="Lantern up" />
                <Chip label="Tide" value="Rising" />
              </div>
            </HudSurface>
          </HudPanel>
        </HudCanvas>
      </HudThemeRoot>
    </div>
  );
}
