import type { CSSProperties, ReactNode } from "react";

import { hudSpace, hudType } from "./hudTokens";
import { HudButton } from "./hudButton";
import { useMenuNav } from "./menuNav";
import { MenuScreen, type MenuScreenScrim, type MenuScreenTransition } from "./menuScreen";

/** One verb on a {@link TitleMenu}: New Game, Continue, Settings, Credits, Quit. */
export interface TitleMenuItem {
  /** Stable id the game routes on. */
  id: string;
  /** Player-facing label. */
  label: string;
  /** One line under the label (save summary, a "no save yet" note). */
  hint?: string;
  /** Render as the screen's primary action. */
  primary?: boolean;
  /** Show but skip it in navigation and clicks. */
  disabled?: boolean;
}

/** Props for {@link TitleMenu}. */
export interface TitleMenuProps {
  /** The game's wordmark or title. Free markup, so a game can art-direct it. */
  title: ReactNode;
  /** Small line above the title (studio, genre, chapter). */
  eyebrow?: ReactNode;
  /** One line under the title. */
  tagline?: ReactNode;
  /** The front-end verbs, in focus order. */
  items: readonly TitleMenuItem[];
  /** A verb was chosen. */
  onSelect: (id: string) => void;
  /** Back/Escape. Omit at the root screen, where there is nowhere to go. */
  onBack?: () => void;
  /** Footer left slot — build version, copyright. */
  footer?: ReactNode;
  /** Footer right slot — replaces the default control hint. */
  controlHint?: ReactNode;
  /** Artwork, a poster, or a live 3D scene painted behind the menu. */
  backdrop?: ReactNode;
  /** Extra content under the verbs (a save summary, a control legend). */
  children?: ReactNode;
  open?: boolean;
  transition?: MenuScreenTransition;
  /** Dim/blur treatment over the scene behind. Default `"dim"`. */
  scrim?: MenuScreenScrim;
  /** The title paints over the whole canvas, so the engine may stop drawing the world behind it. Default false. */
  coversCanvas?: boolean;
  enterMs?: number;
  exitMs?: number;
  reducedMotion?: boolean;
  onClosed?: () => void;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

const column: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: hudSpace("md"),
  width: "min(92vw, 460px)",
};

const itemButton: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  textAlign: "left",
};

/**
 * A game front-end title screen: wordmark, tagline, the game's verbs in a keyboard/gamepad-navigable
 * list, a footer and an optional backdrop. The engine owns navigation, focus and the enter/exit
 * animation; the game owns the title markup, wording, verbs, art and every colour through HudTheme
 * tokens. Pass the live scene (or artwork) as `backdrop` so the title renders over 3D instead of a
 * blank page.
 *
 * @capability title-menu title-screen block — wordmark, tagline, navigable verb list, footer, backdrop slot, animated over a live scene
 */
export function TitleMenu({
  title,
  eyebrow,
  tagline,
  items,
  onSelect,
  onBack,
  footer,
  controlHint,
  backdrop,
  children,
  open = true,
  transition = "slide",
  scrim = "dim",
  coversCanvas,
  enterMs,
  exitMs,
  reducedMotion,
  onClosed,
  className,
  style,
  contentClassName,
  contentStyle,
}: TitleMenuProps): ReactNode {
  const disabled = items.filter((item) => item.disabled === true).map((item) => item.id);
  const nav = useMenuNav({
    ids: items.map((item) => item.id),
    disabled,
    enabled: open,
    onConfirm: onSelect,
    ...(onBack === undefined ? {} : { onBack }),
  });

  return (
    <MenuScreen
      open={open}
      transition={transition}
      scrim={scrim}
      {...(coversCanvas === undefined ? {} : { coversCanvas })}
      {...(enterMs === undefined ? {} : { enterMs })}
      {...(exitMs === undefined ? {} : { exitMs })}
      {...(reducedMotion === undefined ? {} : { reducedMotion })}
      {...(onClosed === undefined ? {} : { onClosed })}
      label="Title menu"
      {...(backdrop === undefined ? {} : { backdrop })}
      className={className}
      style={style}
      contentClassName={contentClassName}
      contentStyle={contentStyle}
    >
      <div data-title-menu="" style={column} {...nav.containerProps}>
        {eyebrow === undefined ? null : (
          <p
            data-title-eyebrow=""
            style={{
              margin: 0,
              fontSize: hudType("xs"),
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--jg-accent, #6ee7a8)",
            }}
          >
            {eyebrow}
          </p>
        )}
        <div
          data-title-wordmark=""
          style={{
            fontFamily: "var(--jg-font-display, inherit)",
            fontSize: hudType("display"),
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.01em",
            color: "var(--jg-text, #f5f7fa)",
            textShadow: "0 2px 18px rgba(0,0,0,0.55)",
          }}
        >
          {title}
        </div>
        {tagline === undefined ? null : (
          <p style={{ margin: 0, fontSize: hudType("sm"), color: "var(--jg-text-dim, #94a3a0)", maxWidth: "34ch" }}>
            {tagline}
          </p>
        )}
        <nav
          data-title-items=""
          style={{ display: "flex", flexDirection: "column", gap: hudSpace("xs"), marginTop: hudSpace("sm") }}
        >
          {items.map((item) => {
            const props = nav.itemProps(item.id);
            return (
              <HudButton
                key={item.id}
                {...props}
                variant={item.primary === true ? "primary" : "secondary"}
                size="lg"
                block
                disabled={item.disabled === true}
                data-title-item={item.id}
                onClick={() => {
                  if (item.disabled !== true) onSelect(item.id);
                }}
                style={itemButton}
              >
                <span style={{ fontSize: hudType("md"), fontWeight: 700 }}>{item.label}</span>
                {item.hint === undefined ? null : (
                  <span style={{ fontSize: hudType("xs"), fontWeight: 500, opacity: 0.78 }}>{item.hint}</span>
                )}
              </HudButton>
            );
          })}
        </nav>
        {children}
        <footer
          data-title-footer=""
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: hudSpace("md"),
            marginTop: hudSpace("md"),
            fontSize: hudType("xs"),
            color: "var(--jg-text-dim, #94a3a0)",
          }}
        >
          <span>{footer}</span>
          <span data-jg-kbd-hint={controlHint === undefined ? "" : undefined}>
            {controlHint ?? "↑↓ move · Enter select · Esc back"}
          </span>
        </footer>
      </div>
    </MenuScreen>
  );
}
