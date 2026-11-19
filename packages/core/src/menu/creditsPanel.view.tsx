/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";

import type { CreditsDocument } from "@jgengine/core/menu/credits";

import { CreditsScreen } from "./creditsScreen.view";
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { hudSpace, hudType } from "@jgengine/core/hud/hudTokens";
import { useMenuNav } from "@jgengine/core/menu/menuNav.view";
import { MenuScreen } from "@jgengine/core/menu/menuScreen.view";

export interface CreditsPanelProps {
  document: CreditsDocument;
  onBack: () => void;
  title?: ReactNode;
  backLabel?: string;
  open?: boolean;
  backdrop?: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

/** @capability credits-panel scrollable, navigable credits screen with a back affordance */
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
