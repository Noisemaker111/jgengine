/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { type KitButtonProps, type KitMenuProps, type KitMeterProps, type KitPanelProps, type KitPromptProps, type KitToastProps } from "./uiKit.view";

/**
 * The markup more than one kit draws the same way. A kit takes a part with its own class prefix and
 * its stylesheet does the rest; a kit whose markup differs keeps its own function.
 * @internal
 */
export function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/**
 * The text beside a meter: `value / max` for `true`, the caller's own node otherwise.
 * @internal
 */
export function readoutText(value: number, max: number, readout: KitMeterProps["readout"]): ReactNode {
  if (readout === true) return `${Math.round(value)} / ${Math.round(max)}`;
  return readout === false || readout === undefined ? null : readout;
}

/** @internal */
export function kitButton(P: string): (props: KitButtonProps) => ReactNode {
  return function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
    return (
      <button
        {...rest}
        type={type}
        aria-pressed={pressed}
        className={cx(`${P}-btn`, className)}
        data-variant={variant}
        data-size={size}
        data-tone={tone}
        data-pressed={pressed === true ? "" : undefined}
      >
        {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
        <span className={`${P}-btn-label`}>{children}</span>
        {glyph === undefined ? null : <span className={`${P}-glyph`}>{glyph}</span>}
      </button>
    );
  };
}

/** @internal */
export function kitPanel(P: string): (props: KitPanelProps) => ReactNode {
  return function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
    const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
    return (
      <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
        {head ? (
          <header className={`${P}-panel-head`}>
            {eyebrow === undefined ? null : <span className={`${P}-eyebrow`}>{eyebrow}</span>}
            {title === undefined ? null : <span className={`${P}-title`}>{title}</span>}
            {aside === undefined ? null : <span className={`${P}-aside`}>{aside}</span>}
          </header>
        ) : null}
        {children === undefined ? null : <div className={`${P}-panel-body`}>{children}</div>}
        {footer === undefined ? null : <footer className={`${P}-panel-foot`}>{footer}</footer>}
      </Tag>
    );
  };
}

/** @internal */
export function kitMenu(P: string): (props: KitMenuProps) => ReactNode {
  return function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
    const primary = items.filter((item) => item.secondary !== true);
    const secondary = items.filter((item) => item.secondary === true);
    const row = (item: KitMenuProps["items"][number]) => (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        onClick={() => onSelect(item.id)}
        {...itemProps(item.id)}
        className={`${P}-menu-item`}
        data-active={item.id === activeId ? "" : undefined}
        data-secondary={item.secondary === true ? "" : undefined}
      >
        <span className={`${P}-menu-label`}>{item.label}</span>
        {item.badge === undefined ? null : <span className={`${P}-menu-badge`}>{item.badge}</span>}
        {item.hint === undefined ? null : <span className={`${P}-menu-hint`}>{item.hint}</span>}
      </button>
    );
    return (
      <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
        {primary.map(row)}
        {secondary.length === 0 ? null : <span className={`${P}-menu-rule`} aria-hidden="true" />}
        {secondary.map(row)}
      </div>
    );
  };
}

/**
 * A prompt's outer element: a button when it can be activated, a plain block otherwise.
 * @internal
 */
export function kitPromptShell(P: string, { onActivate, className, tone, device, style }: Pick<KitPromptProps, "onActivate" | "className" | "tone" | "device" | "style">, body: ReactNode): ReactNode {
  if (onActivate !== undefined) {
    return (
      <button type="button" className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={style} onClick={onActivate}>
        {body}
      </button>
    );
  }
  return (
    <div className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={style}>
      {body}
    </div>
  );
}

/**
 * A meter's label and readout, or nothing when it has neither.
 * @internal
 */
export function kitMeterCaption(P: string, label: ReactNode, text: ReactNode): ReactNode {
  return label === undefined && text === null ? null : (
    <span className={`${P}-meter-text`}>
      {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
      {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
    </span>
  );
}

/**
 * What the outer element of every meter variant carries.
 * @internal
 */
export function kitMeterAttributes(P: string, { className, variant, size, tone, style, value, max }: Required<Pick<KitMeterProps, "variant" | "size" | "tone" | "value" | "max">> & { className: KitMeterProps["className"]; style: KitMeterProps["style"] }) {
  return {
    className: cx(`${P}-meter`, className),
    "data-variant": variant,
    "data-size": size,
    "data-tone": tone,
    style,
    role: "meter",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max,
  };
}

/**
 * The stock toast; `times` is the mark before a repeat count.
 * @internal
 */
export function kitToast(P: string, times: string): (props: KitToastProps) => ReactNode {
  return function Toast({ tone, title, icon, count, leaving, className, style, children }: KitToastProps): ReactNode {
    return (
      <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
        {icon === undefined ? null : <span className={`${P}-toast-icon`}>{icon}</span>}
        <span className={`${P}-toast-text`}>
          {title === undefined ? null : <span className={`${P}-toast-title`}>{title}</span>}
          <span className={`${P}-toast-body`}>{children}</span>
        </span>
        {count === undefined || count < 2 ? null : (
          <span className={`${P}-toast-count`}>
            {times}
            {count}
          </span>
        )}
      </div>
    );
  };
}
