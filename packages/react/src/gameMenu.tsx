import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useReducedMotion } from "./accessibility";
import { createGameMenuSound, type GameMenuSound } from "./gameMenuSound";
import { hudDuration, hudEase, hudFont, hudType } from "./hudTokens";
import { useMenuNav } from "./menuNav";

/**
 * A game's front-end menu: a full-bleed surface over a living background, a logo, primary verbs on
 * the left that animate as the selection moves, and a detail pane on the right that changes with the
 * highlighted verb. It is the block a main menu, a pause menu and their sub-screens are built from,
 * so a game composes one menu system instead of a stack of modal panels.
 *
 * The surface is exactly the viewport: `position: fixed` with `overflow: hidden`, and the document
 * scroll is locked while it is open, so a tall menu can never grow a page scrollbar. Content that
 * genuinely scrolls (credits) scrolls inside its own pane.
 */

/** One primary verb in a {@link GameMenu}. */
export interface GameMenuItem {
  /** Stable id the game routes on. */
  id: string;
  /** Player-facing label. */
  label: string;
  /** One short line under the label — a save summary, a state note. Omit for a clean row. */
  hint?: string;
  /** Show the row but skip it in navigation and clicks. */
  disabled?: boolean;
  /** Small marker at the end of the row (a badge, a count, a key glyph). */
  badge?: ReactNode;
}

/** The logo slot. Give it `image` for art, or `text` for a styled wordmark. */
export interface GameMenuLogo {
  /** Image URL for the game's logo. Sized by the `--jg-menu-logo` token, never by a heading tag. */
  image?: string;
  /** Alt text for the logo image. Defaults to `title` when that is a string. */
  alt?: string;
  /** Styled type instead of an image. */
  text?: ReactNode;
  /** Plain title, used for the accessible name and as the alt fallback. */
  title?: string;
}

/** How a {@link GameMenu} is used. `pause` is the same system at a smaller scale. */
export type GameMenuVariant = "title" | "pause";

/**
 * Inline style for a menu surface that also accepts `--jg-*` theme tokens, so a game sets a token
 * with `{ "--jg-menu-radius": "12px" }` instead of casting the object to `CSSProperties`.
 */
export type GameMenuStyle = CSSProperties & Record<`--${string}`, string | number>;

/** Props for {@link GameMenu}. */
export interface GameMenuProps {
  /** Primary verbs, in focus order. */
  items: readonly GameMenuItem[];
  /** The verb focused on mount. Default the first enabled one. */
  initialId?: string;
  /** A verb was confirmed (Enter, Space, A, or a click). */
  onSelect: (id: string) => void;
  /** Back (Escape, Backspace, B, Start). On a pause menu this is the resume action. */
  onBack?: () => void;
  /** The highlighted verb changed — use it to load the detail for `id`. */
  onHighlight?: (id: string | null) => void;
  /** The right-hand pane's content for the highlighted verb. */
  detail?: ReactNode | ((id: string | null) => ReactNode);
  /** Logo slot: an image or styled type, sized by the logo token. */
  logo?: GameMenuLogo | ReactNode;
  /** Small line above the logo (studio, chapter, mode). */
  eyebrow?: ReactNode;
  /** One line under the logo. */
  tagline?: ReactNode;
  /**
   * Layer painted across the whole viewport behind the menu: a live scene component, key art, a
   * video. Leave it out when the engine's own 3D canvas sits behind the menu — the menu stays
   * transparent and only tints and vignettes it, so play keeps rendering underneath.
   */
  background?: ReactNode;
  /**
   * Key-art URL for the drifting background layer. Omit when the live scene behind the menu is the
   * background. With neither, the menu still tints and vignettes whatever is behind it.
   */
  art?: string;
  /** Secondary verbs at the bottom-left (quit, back). Same navigation, quieter styling. */
  secondary?: readonly GameMenuItem[];
  /** Footer left slot: build version, studio. */
  footer?: ReactNode;
  /** Footer right slot: replaces the default control hint. */
  controlHint?: ReactNode;
  /** Selection sound. Default on. Pass `false` for silence, or a player from `createGameMenuSound`. */
  sound?: boolean | GameMenuSound;
  /** Title menu or the smaller pause menu. Default `"title"`. */
  variant?: GameMenuVariant;
  /** Open state the game owns. A closed menu renders nothing and releases the document scroll. */
  open?: boolean;
  /** Force motion off. Reduced motion is also read from the accessibility preference and the OS. */
  reducedMotion?: boolean;
  /** Accessible name of the surface. Default `"Main menu"` (`"Paused"` for the pause variant). */
  label?: string;
  className?: string;
  style?: GameMenuStyle;
  detailClassName?: string;
  detailStyle?: GameMenuStyle;
}

let scrollLocks = 0;
let savedDocumentOverflow = "";
let savedBodyOverflow = "";

function lockDocumentScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (scrollLocks === 0) {
    savedDocumentOverflow = document.documentElement.style.overflow;
    savedBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks > 0 || typeof document === "undefined") return;
    document.documentElement.style.overflow = savedDocumentOverflow;
    document.body.style.overflow = savedBodyOverflow;
  };
}

/**
 * Lock the page scroll while `active`, so a fixed full-bleed surface is exactly the viewport and the
 * document behind it never gains a scrollbar. Nested and repeated locks are counted, and the previous
 * inline styles are restored when the last one releases.
 *
 * @capability use-viewport-scroll-lock count-aware document scroll lock for full-bleed surfaces
 */
export function useViewportScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockDocumentScroll();
  }, [active]);
}

const ROW_HEIGHT: Record<GameMenuVariant, number> = { title: 58, pause: 46 };

const VIGNETTE =
  "radial-gradient(125% 110% at 26% 42%, rgba(4,7,12,0.02) 0%, rgba(4,7,12,0.34) 66%, rgba(2,4,7,0.8) 100%)";

const TINT =
  "linear-gradient(100deg, rgba(6,10,16,0.9) 0%, rgba(6,10,16,0.74) 34%, rgba(6,10,16,0.34) 56%, rgba(6,10,16,0.08) 78%, rgba(6,10,16,0.28) 100%)";

function logoNode(logo: GameMenuProps["logo"], title: string | undefined, reduced: boolean): ReactNode {
  if (logo === undefined || logo === null || logo === false) return null;
  if (typeof logo === "object" && !Array.isArray(logo) && !("type" in (logo as object))) {
    const spec = logo as GameMenuLogo;
    const size = "var(--jg-menu-logo-size, clamp(30px, 4.6vw, 66px))";
    if (spec.image !== undefined) {
      return (
        <img
          data-jg-game-menu-logo=""
          src={spec.image}
          alt={spec.alt ?? spec.title ?? title ?? ""}
          style={{
            display: "block",
            width: "auto",
            height: `calc(${size} * 1.15)`,
            maxWidth: "min(420px, 46vw)",
            objectFit: "contain",
            filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.6))",
          }}
        />
      );
    }
    return (
      <div
        data-jg-game-menu-logo=""
        style={{
          fontFamily: hudFont.display,
          fontSize: size,
          fontWeight: 800,
          lineHeight: 0.98,
          letterSpacing: "-0.02em",
          color: "var(--jg-text, #f7f9fc)",
          textShadow: "0 2px 24px rgba(0,0,0,0.65), 0 0 60px var(--jg-accent-glow, rgba(88,196,255,0.25))",
          animation: reduced ? undefined : `jg-menu-rise 620ms ${hudEase("easeOut")} both`,
        }}
      >
        {spec.text ?? spec.title ?? title}
      </div>
    );
  }
  return (
    <div
      data-jg-game-menu-logo=""
      style={{
        fontFamily: hudFont.display,
        fontSize: "var(--jg-menu-logo-size, clamp(30px, 4.6vw, 66px))",
        fontWeight: 800,
        lineHeight: 0.98,
        letterSpacing: "-0.02em",
        color: "var(--jg-text, #f7f9fc)",
        textShadow: "0 2px 24px rgba(0,0,0,0.65), 0 0 60px var(--jg-accent-glow, rgba(88,196,255,0.25))",
        animation: reduced ? undefined : `jg-menu-rise 620ms ${hudEase("easeOut")} both`,
      }}
    >
      {logo as ReactNode}
    </div>
  );
}

/**
 * A game front-end menu: full-bleed over a living background, with a logo, an animated primary list
 * and a detail pane that follows the highlighted verb. One system covers the main menu and the pause
 * menu (`variant="pause"`), keyboard and gamepad navigation come from `useMenuNav`, confirmation
 * ticks are generated (no audio asset), and the document never scrolls while it is open.
 *
 * The engine owns the surface, layout, motion, focus order, sound and the save/character panes it
 * exports next to this component. The game owns the art, the logo, the wording, the verbs and what
 * each detail pane shows. The surface takes pointer input for itself and leaves its painted
 * backdrop transparent to input, so a HUD wrapper that passes clicks through does not make the
 * verbs dead; `style` and `detailStyle` accept `--jg-*` tokens without a cast.
 *
 * @capability game-menu full-bleed game menu — living background, token-sized logo, animated navigable verbs, detail pane, selection sound, pause variant, no page scrollbar
 */
export function GameMenu({
  items,
  initialId,
  onSelect,
  onBack,
  onHighlight,
  detail,
  logo,
  eyebrow,
  tagline,
  background,
  art,
  secondary,
  footer,
  controlHint,
  sound = true,
  variant = "title",
  open = true,
  reducedMotion,
  label,
  className,
  style,
  detailClassName,
  detailStyle,
}: GameMenuProps): ReactNode {
  const prefersReduced = useReducedMotion();
  const reduced = reducedMotion === undefined ? prefersReduced : reducedMotion || prefersReduced;
  useViewportScrollLock(open);

  const allItems = useMemo(() => [...items, ...(secondary ?? [])], [items, secondary]);
  const disabled = useMemo(
    () => allItems.filter((item) => item.disabled === true).map((item) => item.id),
    [allItems],
  );

  const soundRef = useRef<GameMenuSound | null>(null);
  useEffect(() => {
    if (sound === false) return;
    const player = typeof sound === "object" ? sound : createGameMenuSound();
    soundRef.current = player;
    return () => {
      if (typeof sound !== "object") player.dispose();
      soundRef.current = null;
    };
  }, [sound]);

  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;

  const nav = useMenuNav({
    ids: allItems.map((item) => item.id),
    disabled,
    enabled: open,
    ...(initialId === undefined ? {} : { initialId }),
    onConfirm: (id) => {
      const item = allItems.find((candidate) => candidate.id === id);
      if (item === undefined || item.disabled === true) return;
      soundRef.current?.play("confirm");
      onSelect(id);
    },
    ...(onBack === undefined
      ? {}
      : {
          onBack: () => {
            soundRef.current?.play("back");
            onBack();
          },
        }),
  });

  // A cursor that happens to rest over a row when the menu opens must not select it: hover only
  // counts once the pointer has actually moved in this session.
  const pointerMoved = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mark = (): void => { pointerMoved.current = true; };
    window.addEventListener("pointermove", mark, { passive: true });
    return () => window.removeEventListener("pointermove", mark);
  }, []);
  const hoverProps = (id: string) => {
    const props = nav.itemProps(id);
    return { ...props, onPointerEnter: () => { if (pointerMoved.current) props.onPointerEnter(); } };
  };

  const activeId = nav.activeId;
  const activeIndex = allItems.findIndex((item) => item.id === activeId);
  const mounted = useRef(false);
  const appliedInitial = useRef<string | undefined>(initialId);
  // `initialId` is the verb the game wants focused (Continue when a save exists). When that changes
  // after mount — a save finished loading, a screen swapped — move the selection rather than
  // remounting the whole menu, which would replay the entry animation and drop focus.
  useEffect(() => {
    if (initialId === undefined || appliedInitial.current === initialId || disabled.includes(initialId)) return;
    appliedInitial.current = initialId;
    nav.setActive(initialId);
  }, [initialId, disabled, nav.activeId, nav.setActive]);
  // The first pass can run before item refs exist, so focus the selection once after paint when the
  // menu owns an idle document. Arrow keys then land on the menu itself instead of the page.
  useEffect(() => {
    if (!open) return;
    if (typeof requestAnimationFrame !== "function") return;
    const frame = requestAnimationFrame(() => {
      const active = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
      const insideMenu = active !== null && typeof active.closest === "function" && active.closest("[data-jg-game-menu]") !== null;
      if (insideMenu && active !== document.body) return;
      const target = document.querySelector<HTMLElement>("[data-jg-game-menu] [data-jg-menu-item][aria-current='true']");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
    } else if (activeId !== null) {
      soundRef.current?.play("move");
    }
    onHighlightRef.current?.(activeId);
  }, [activeId]);

  if (!open) return null;

  const isPause = variant === "pause";
  const rowHeight = ROW_HEIGHT[variant];
  const primaryCount = items.length;
  const detailNode = typeof detail === "function" ? detail(activeId) : detail;
  const title = typeof logo === "object" && logo !== null && !Array.isArray(logo) ? (logo as GameMenuLogo).title : undefined;
  const surfaceLabel = label ?? (isPause ? "Paused" : "Main menu");

  return (
    <div
      data-jg-game-menu=""
      data-variant={variant}
      data-open=""
      role="dialog"
      aria-modal="true"
      aria-label={surfaceLabel}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        overflow: "hidden",
        overscrollBehavior: "contain",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gridTemplateColumns: "minmax(232px, clamp(232px, 27vw, 360px)) minmax(0, 1fr)",
        columnGap: "clamp(16px, 3vw, 56px)",
        padding: isPause
          ? "clamp(16px, 2.4vw, 34px) clamp(20px, 3.2vw, 56px)"
          : "clamp(18px, 3.2vw, 56px) clamp(20px, 3.6vw, 64px)",
        boxSizing: "border-box",
        // The surface is an overlay: it takes its own input even when the HUD wrapper around it
        // passes every pointer through to the scene.
        pointerEvents: "auto",
        color: "var(--jg-text, #f5f7fa)",
        fontFamily: hudFont.body,
        animation: reduced ? undefined : `jg-fade-in ${hudDuration("slow")} ${hudEase("easeOut")} both`,
        ...style,
      }}
    >
      <div
        data-jg-game-menu-backdrop=""
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
      >
        {background === undefined ? null : (
          <div data-jg-game-menu-live="" style={{ position: "absolute", inset: 0 }}>
            {background}
          </div>
        )}
        {art === undefined ? null : (
          <div
            data-jg-game-menu-art=""
            style={{
              position: "absolute",
              inset: "-8%",
              backgroundImage: `url(${art})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transform: "scale(1.06)",
              animation: reduced ? undefined : "jg-menu-drift 46s ease-in-out infinite alternate",
              willChange: "transform",
            }}
          />
        )}
        <div
          data-jg-game-menu-tint=""
          style={{ position: "absolute", inset: 0, background: TINT, opacity: isPause ? 1 : 0.94 }}
        />
        <div
          data-jg-game-menu-vignette=""
          style={{ position: "absolute", inset: 0, background: VIGNETTE }}
        />
        <div
          data-jg-game-menu-grain=""
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.06,
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)",
            mixBlendMode: "overlay",
          }}
        />
      </div>

      <header
        data-jg-game-menu-header=""
        style={{
          position: "relative",
          zIndex: 1,
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minWidth: 0,
        }}
      >
        {eyebrow === undefined ? null : (
          <div
            data-jg-game-menu-eyebrow=""
            style={{
              fontSize: hudType("xs"),
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--jg-accent, #7dd3fc)",
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </div>
        )}
        {logoNode(logo, title, reduced)}
        {tagline === undefined ? null : (
          <div
            data-jg-game-menu-tagline=""
            style={{
              fontSize: hudType(isPause ? "sm" : "md"),
              color: "var(--jg-text-dim, rgba(226,235,245,0.68))",
              maxWidth: "46ch",
            }}
          >
            {tagline}
          </div>
        )}
      </header>

      <div
        data-jg-game-menu-nav-wrap=""
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: isPause ? "center" : "flex-start",
          minHeight: 0,
          paddingTop: isPause ? 0 : "clamp(8px, 2vh, 28px)",
        }}
      >
                <nav
          data-jg-game-menu-items=""
          {...nav.containerProps}
          style={{ position: "relative", display: "flex", flexDirection: "column", gap: 2 }}
          onKeyDown={(event) => {
            nav.containerProps.onKeyDown(event);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") event.stopPropagation();
          }}
        >
          <div
            data-jg-game-menu-nav-surface=""
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-16px -22px",
              borderRadius: "var(--jg-menu-surface-radius, 8px)",
              background:
                "linear-gradient(96deg, rgba(4,7,11,0.6) 0%, rgba(4,7,11,0.34) 56%, rgba(4,7,11,0) 100%)",
              maskImage: "linear-gradient(180deg, transparent 0, #000 9%, #000 91%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 9%, #000 91%, transparent 100%)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              pointerEvents: "none",
            }}
          />
          <div
            data-jg-game-menu-rail=""
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 8,
              top: 0,
              height: rowHeight,
              borderRadius: 10,
              opacity: activeIndex < 0 ? 0 : 1,
              transform: `translate3d(0, ${Math.max(0, activeIndex) * (rowHeight + 2)}px, 0) scale(${activeIndex >= primaryCount ? 0.98 : 1})`,
              transition: reduced
                ? undefined
                : `transform ${hudDuration("base")} ${hudEase("spring")}, opacity ${hudDuration("fast")} ${hudEase("easeOut")}`,
              background: "linear-gradient(90deg, var(--jg-accent-glow, rgba(94,196,255,0.22)) 0%, rgba(255,255,255,0.05) 62%, transparent 100%)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), 0 10px 30px -14px rgba(0,0,0,0.9)",
              borderLeft: "2px solid var(--jg-accent, #7dd3fc)",
            }}
          />
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                {...hoverProps(item.id)}
                data-jg-game-menu-item={item.id}
                data-active={active ? "" : undefined}
                disabled={item.disabled === true}
                onClick={() => {
                  if (item.disabled === true) return;
                  soundRef.current?.play("confirm");
                  onSelect(item.id);
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  height: rowHeight,
                  paddingLeft: active ? 18 : 12,
                  paddingRight: 12,
                  border: "none",
                  background: "transparent",
                  color: item.disabled === true ? "rgba(226,235,245,0.32)" : active ? "var(--jg-text, #ffffff)" : "rgba(226,235,245,0.78)",
                  fontFamily: hudFont.display,
                  fontSize: hudType(isPause ? "md" : "xl"),
                  fontWeight: active ? 700 : 600,
                  letterSpacing: "0.01em",
                  textAlign: "left",
                  cursor: item.disabled === true ? "not-allowed" : "pointer",
                  transition: reduced ? undefined : `padding ${hudDuration("base")} ${hudEase("spring")}, color ${hudDuration("fast")} linear`,
                  textShadow: active
                    ? "0 1px 12px rgba(0,0,0,0.8), 0 0 22px var(--jg-accent-glow, rgba(94,196,255,0.4))"
                    : "0 1px 10px rgba(0,0,0,0.72)",
                  outline: "none",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
                  {item.hint === undefined ? null : (
                    <span
                      style={{
                        fontSize: hudType("xs"),
                        fontWeight: 500,
                        letterSpacing: 0,
                        color: "var(--jg-text-dim, rgba(203,213,225,0.66))",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        opacity: active ? 1 : 0.72,
                      }}
                    >
                      {item.hint}
                    </span>
                  )}
                </span>
                {item.badge === undefined ? null : (
                  <span style={{ fontSize: hudType("xs"), color: "var(--jg-accent, #7dd3fc)", fontWeight: 700 }}>{item.badge}</span>
                )}
              </button>
            );
          })}
          {secondary === undefined || secondary.length === 0 ? null : (
            <div style={{ height: 1, margin: "10px 12px", background: "rgba(255,255,255,0.12)" }} aria-hidden="true" />
          )}
          {(secondary ?? []).map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                {...hoverProps(item.id)}
                data-jg-game-menu-item={item.id}
                data-secondary=""
                data-active={active ? "" : undefined}
                disabled={item.disabled === true}
                onClick={() => {
                  if (item.disabled === true) return;
                  soundRef.current?.play("confirm");
                  onSelect(item.id);
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: rowHeight,
                  paddingLeft: active ? 18 : 12,
                  border: "none",
                  background: "transparent",
                  color: active ? "var(--jg-text, #ffffff)" : "rgba(203,213,225,0.6)",
                  fontFamily: hudFont.body,
                  fontSize: hudType("md"),
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: item.disabled === true ? "not-allowed" : "pointer",
                  transition: reduced ? undefined : `padding ${hudDuration("base")} ${hudEase("spring")}`,
                  outline: "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        data-jg-game-menu-detail=""
        data-detail-id={activeId ?? ""}
        className={detailClassName}
        style={{
          position: "relative",
          zIndex: 1,
          minWidth: 0,
          minHeight: 0,
          maxHeight: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingTop: isPause ? 0 : "clamp(6px, 1.6vh, 20px)",
          ...detailStyle,
        }}
      >
        {detailNode === undefined || detailNode === null ? null : (
          <div
            key={activeId ?? "none"}
            data-jg-game-menu-pane=""
            style={{
              minHeight: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              animation: reduced ? undefined : `jg-menu-pane-in ${hudDuration("slow")} ${hudEase("easeOut")} both`,
            }}
          >
            {detailNode}
          </div>
        )}
      </div>

      <footer
        data-jg-game-menu-footer=""
        style={{
          position: "relative",
          zIndex: 1,
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingTop: 8,
          fontSize: hudType("xs"),
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(203,213,225,0.45)",
        }}
      >
        <span data-jg-game-menu-footer-left="">{footer}</span>
        <span data-jg-kbd-hint="" data-jg-game-menu-footer-hint="">
          {controlHint ??
            (isPause ? "Esc resume · Enter select" : "↑↓ move · Enter select · Esc back")}
        </span>
      </footer>
    </div>
  );
}

/**
 * A pause menu built from {@link GameMenu}: the same surface and navigation at a smaller scale, so a
 * game composes one menu system rather than a second one. Escape (or B/Start) resumes.
 *
 * @capability game-pause-menu pause menu from the shared game-menu system — same navigation and surface, sized down
 */
export function GamePauseMenu(
  props: Omit<GameMenuProps, "variant"> & { onResume?: () => void },
): ReactNode {
  const { onResume, onBack, ...rest } = props;
  return <GameMenu {...rest} variant="pause" onBack={onBack ?? onResume} label={rest.label ?? "Paused"} />;
}













