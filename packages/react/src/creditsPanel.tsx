import type { CSSProperties, ReactNode } from "react";

import type { CreditsDocument } from "@jgengine/core/game/credits";

import { CreditsScreen } from "./creditsScreen";
import { HudButton } from "./hudButton";
import { hudSpace, hudType } from "./hudTokens";
import { useMenuNav } from "./menuNav";
import { MenuScreen } from "./menuScreen";

/** Props for {@link CreditsPanel}. */
export interface CreditsPanelProps {
  /** The credits to show — typed lines, generated attribution, or a merge of both. */
  document: CreditsDocument;
  /** Back to the previous screen (the back button, Escape, B/Circle or Start). */
  onBack: () => void;
  /** Screen heading. Default `"Credits"`. */
  title?: ReactNode;
  /** Back button label. Default `"Back"`. */
  backLabel?: string;
  /** Open state. */
  open?: boolean;
  /** Artwork or a live scene behind the panel. */
  backdrop?: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

/**
 * A reachable credits screen: the generated or hand-authored {@link CreditsDocument} in a scrollable
 * panel over the scene, with one back affordance that keyboard and gamepad both reach. The game owns
 * the backdrop and the wording; the block keeps the lines HudTheme-skinned and the exit working.
 *
 * @capability credits-panel scrollable, navigable credits screen with a back affordance
 */
export function CreditsPanel({
  document,
  onBack,
  title = "Credits",
  backLabel = "Back",
  open = true,
  backdrop,
  className,
  style,
  contentClassName,
  contentStyle,
}: CreditsPanelProps): ReactNode {
  const nav = useMenuNav({ ids: ["back"], enabled: open, onConfirm: onBack, onBack });
  return (
    <MenuScreen
      open={open}
      transition="slide"
      scrim="blur"
      label={typeof title === "string" ? title : "Credits"}
      {...(backdrop === undefined ? {} : { backdrop })}
      className={className}
      style={style}
      contentClassName={contentClassName}
      contentStyle={contentStyle}
    >
      <div
        data-credits-panel=""
        {...nav.containerProps}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: hudSpace("md"),
          width: "min(92vw, 640px)",
          maxHeight: "82vh",
          padding: hudSpace("lg"),
          borderRadius: 14,
          background: "var(--jg-surface, rgba(16,20,26,0.92))",
          border: "1px solid var(--jg-edge, rgba(255,255,255,0.12))",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: hudSpace("md") }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--jg-font-display, inherit)",
              fontSize: hudType("xl"),
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--jg-text, #f5f7fa)",
            }}
          >
            {title}
          </h2>
          <span data-jg-kbd-hint="" style={{ fontSize: hudType("xs"), color: "var(--jg-text-dim, #94a3a0)" }}>
            Esc back
          </span>
        </div>
        <div data-credits-scroll="" style={{ overflowY: "auto", minHeight: 0, paddingRight: hudSpace("xs") }}>
          <CreditsScreen document={document} />
        </div>
        <HudButton {...nav.itemProps("back")} size="md" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          {backLabel}
        </HudButton>
      </div>
    </MenuScreen>
  );
}
