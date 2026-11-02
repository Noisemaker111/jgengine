/** LLMville kit stylesheet: glass surfaces, themed card shells, buttons, tokens, meters and toasts on `--kit-*` tokens. */
export const LLMVILLE_KIT_CSS = String.raw`
/* LLMville kit parts. Reads only --kit-* tokens (src/kit/llmvilleKit.tsx). No backdrop-filter: it re-renders every frame over the live 3D scene. */
.llm-btn, .llm-panel, .llm-card, .llm-meter, .llm-prompt, .llm-toast { box-sizing: border-box; }
.llm-panel, .llm-meter, .llm-prompt, .llm-toast { color: var(--kit-ink); font-family: var(--kit-font-body); }
.llm-panel[data-variant="dialog"], .llm-toast { animation: llm-in calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.llm-panel[data-state="closed"], .llm-toast[data-state="closed"] { animation: llm-out calc(var(--kit-exit-ms) * var(--kit-motion)) var(--kit-ease) both; }
.llm-panel__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
.llm-panel__head .llm-panel__label { display: block; margin-bottom: 0; }
.llm-panel__title { display: block; font: 700 1rem / 1.2 var(--kit-font-display); color: var(--kit-ink); }
.llm-panel__foot { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.llm-glyph { display: inline-grid; place-items: center; min-width: 1.4rem; height: 1.4rem; padding: 0 0.3rem; border: 1px solid var(--kit-line-strong); border-radius: 0.35rem; background: rgba(0, 0, 0, 0.25); font: 700 0.75rem / 1 var(--kit-font-display); color: var(--kit-ink); }
.llm-prompt { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.85rem; border: 1px solid var(--kit-line); border-radius: var(--kit-r-pill); background: var(--kit-surface); font: 600 0.8125rem / 1 var(--kit-font-body); }
button.llm-prompt { cursor: pointer; pointer-events: auto; }
.llm-prompt[data-tone="bad"] { border-color: color-mix(in srgb, var(--kit-bad) 50%, transparent); }

/* Meters: a pill track; a shell class (lcd, timeline, terminal, invoice-due, row) reshapes it. */
.llm-meter { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "label value" "track track"; align-items: center; gap: 0.25rem 0.5rem; font-size: 0.75rem; }
.llm-meter__label { grid-area: label; }
.llm-meter__value { grid-area: value; font-variant-numeric: tabular-nums; }
.llm-meter__track { grid-area: track; display: block; position: relative; overflow: hidden; height: 10px; border-radius: var(--kit-r-pill); background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(244, 236, 221, 0.08); }
.llm-meter__fill { display: block; height: 100%; background: linear-gradient(90deg, var(--kit-teal), #7fd5bd); box-shadow: 0 0 10px rgba(95, 194, 168, 0.4); transition: width 0.3s ease-out; }
.llm-meter[data-tone="accent"] .llm-meter__fill { background: var(--kit-accent); box-shadow: none; }
.llm-meter[data-tone="warn"] .llm-meter__fill { background: var(--kit-amber); box-shadow: none; }
.llm-meter[data-tone="bad"] .llm-meter__fill { background: var(--kit-bad); box-shadow: none; }
.llm-meter--lcd .llm-meter__track { height: 6px; background: #0a0e0c; border: 1px inset #1a2824; border-radius: 2px; }
.llm-meter.llm-meter--lcd .llm-meter__fill { background: var(--kit-teal); box-shadow: 0 0 6px rgba(95, 194, 168, 0.6); }
.llm-meter--timeline .llm-meter__track { height: 8px; background: #1a2422; border: 1px solid #2a3834; border-radius: 2px; }
.llm-meter--timeline .llm-meter__fill { background: linear-gradient(90deg, var(--kit-accent), var(--kit-amber)); box-shadow: none; }
.llm-meter--timeline .llm-meter__label { font-size: 0.5625rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(244, 236, 221, 0.45); }
.llm-meter--terminal .llm-meter__track { height: 4px; background: #0a1210; border: 1px solid #243430; border-radius: 0; }
.llm-meter--terminal .llm-meter__fill { background: var(--kit-teal); box-shadow: none; transition: width 0.1s linear; }
.llm-meter--row { grid-template-columns: auto 1fr auto; grid-template-areas: "label track value"; gap: 0.5rem; }
.llm-meter--row .llm-meter__label { font-size: 0.625rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(244, 236, 221, 0.5); min-width: 4.5rem; }
.llm-meter--row .llm-meter__value { font-family: var(--kit-font-mono); font-size: 0.6875rem; font-weight: 700; color: var(--kit-teal); }
.llm-meter--row[data-tone="warn"] .llm-meter__value { color: var(--kit-amber); }
.llm-meter--row[data-tone="accent"] .llm-meter__value { color: var(--kit-accent); }
.llm-meter--row[data-tone="neutral"] .llm-meter__value { color: rgba(244, 236, 221, 0.75); }

.llm-toast__count { opacity: 0.7; font-size: 0.75rem; }
.llm-toast__progress { position: absolute; top: 0; left: 0; right: 0; z-index: 2; height: 3px; background: rgba(0, 0, 0, 0.2); overflow: hidden; }
.llm-toast__progress > span { display: block; height: 100%; background: var(--kit-accent-deep); transform-origin: left; }

@keyframes llm-in { from { opacity: 0; translate: 0 6px; } }
@keyframes llm-out { to { opacity: 0; translate: 0 6px; } }
@keyframes llm-drain { to { transform: scaleX(0); } }
.llm-resources { pointer-events: none; }
/* The tablet you hold: a dark bezel around the ink screen. Border widths and corners stay the frame's own geometry. */
.llm-panel--tablet-device { background: var(--kit-ground); border-color: var(--kit-bezel); }

/* ---- Shared card shell ---- */
.llm-card {
  position: relative;
  overflow: hidden;
}

.llm-card--top-decoration {
  overflow: visible;
}

.llm-card__header {
  flex-shrink: 0;
}

.llm-card__body {
  position: relative;
  z-index: 1;
}

/* Quest ticket — pinned lab sticky note, slight tilt */
.llm-card--quest-ticket {
  background: linear-gradient(165deg, #f5e6a8 0%, #edd98a 55%, #e8cf72 100%);
  border: 1px solid #c9b56a;
  border-radius: 2px 2px 12px 2px;
  box-shadow:
    3px 4px 12px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  color: #2d2416;
  transform: rotate(-1.2deg);
  padding: 0.75rem 1rem 0.85rem;
  min-height: 3.5rem;
  max-width: 16rem;
}

.llm-card--quest-ticket .llm-card__pin {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f09a84, #c44e38 55%, #7a2a1c);
  box-shadow:
    0 2px 5px rgba(0, 0, 0, 0.45),
    inset 0 -1px 2px rgba(0, 0, 0, 0.25);
  z-index: 20;
  pointer-events: none;
}

.llm-card--quest-ticket .llm-card__body {
  padding-top: 0.25rem;
}

/* Invoice — spiral notebook page, wider than tall, hand-paper feel */
.llm-card--invoice {
  background:
    linear-gradient(155deg, rgba(255, 252, 245, 0.85) 0%, transparent 42%),
    radial-gradient(ellipse at 88% 12%, rgba(232, 210, 170, 0.18) 0%, transparent 48%),
    radial-gradient(ellipse at 8% 92%, rgba(205, 185, 155, 0.14) 0%, transparent 52%),
    #f3ede3;
  border: 1px solid #d6cbb8;
  border-radius: 7px 5px 8px 4px;
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.65),
    2px 5px 16px rgba(45, 36, 22, 0.17),
    0 1px 2px rgba(45, 36, 22, 0.08);
  color: #2d2416;
  font-family: var(--kit-font-body);
  max-width: 20rem;
  min-width: 17rem;
}

.llm-card--invoice::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 18px;
  border-bottom: 1px solid #d8cfc0;
  background-color: #ebe4d8;
  background-image: radial-gradient(circle at 8px 9px, #faf6ee 3px, #b5a595 3.5px, #b5a595 4.5px, transparent 4.5px);
  background-size: 16px 18px;
  background-position: 8px 0;
  border-radius: 6px 4px 0 0;
}

.llm-card--invoice::after {
  content: "";
  position: absolute;
  top: 5px;
  left: 3px;
  right: 5px;
  height: 10px;
  border: 2px solid #c4b8a8;
  border-top: none;
  border-radius: 0 0 82% 78% / 0 0 100% 100%;
  opacity: 0.5;
  pointer-events: none;
}

.llm-card--invoice .llm-card__body {
  padding: 0.75rem 1.1rem 0.85rem;
  padding-top: 1.35rem;
}

/* Invoice bill card — afford / overdue modifiers */
.invoice-bill-card {
  transform: rotate(-0.4deg);
}

.invoice-bill-card--overdue {
  border-color: #d4a8a0;
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.55),
    2px 5px 16px rgba(120, 48, 40, 0.14),
    0 0 0 1px rgba(184, 50, 50, 0.08);
}

.invoice-bill-card--unaffordable {
  filter: saturate(0.82);
}

.invoice-bill-card--unaffordable .invoice-bill-card__glyph {
  opacity: 0.65;
}

.invoice-bill-card__amount {
  font-size: 1.65rem;
  line-height: 1.1;
}

.invoice-bill-card__amount--affordable {
  color: #c75d45;
}

.invoice-bill-card__amount--unaffordable {
  color: #9a8b78;
  text-decoration: line-through;
  text-decoration-color: rgba(154, 139, 120, 0.55);
  text-decoration-thickness: 2px;
}

.invoice-bill-card__overdue-stamp {
  position: absolute;
  top: 42%;
  left: 50%;
  z-index: 20;
  pointer-events: none;
  transform: translate(-50%, -50%) rotate(-14deg);
  padding: 0.2rem 0.55rem 0.25rem;
  border: 3px double #b83232;
  border-radius: 3px;
  background: rgba(248, 236, 232, 0.35);
  box-shadow:
    inset 0 0 12px rgba(184, 50, 50, 0.06),
    0 1px 0 rgba(184, 50, 50, 0.15);
}

.invoice-bill-card__overdue-stamp-text {
  display: block;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b83232;
  opacity: 0.88;
  text-shadow:
    0.5px 0.5px 0 rgba(184, 50, 50, 0.25),
    -0.5px 0 rgba(184, 50, 50, 0.12);
  /* Slight ink skip — stamped, not printed */
  mask-image: linear-gradient(105deg, black 88%, transparent 92%, black 94%, transparent 97%, black 100%);
}

/* Terminal window — dark monospace with title dots */
.llm-card--terminal {
  background: #0a1210;
  border: 2px solid #243430;
  border-radius: 6px 6px 4px 4px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    inset 0 0 40px rgba(95, 194, 168, 0.03);
  color: #5fc2a8;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.llm-card--terminal .llm-card__header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.4rem 0.6rem;
  background: #16201e;
  border-bottom: 1px solid #243430;
}

.llm-card--terminal .llm-card__header::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e8836b;
  box-shadow: 12px 0 0 #e0a95c, 24px 0 0 #5fc2a8;
}

.llm-card--terminal .llm-card__body {
  padding: 0.65rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.45;
}

/* Blueprint — dashed cyan border, grid texture */
.llm-card--blueprint {
  background:
    linear-gradient(rgba(95, 194, 168, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(95, 194, 168, 0.06) 1px, transparent 1px),
    #162a28;
  background-size: 12px 12px;
  border: 2px dashed rgba(95, 194, 168, 0.45);
  border-radius: 2px;
  color: var(--kit-ink);
  padding: 0.85rem 1rem;
}

.llm-card--blueprint .llm-card__corner-fold {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, transparent 50%, rgba(95, 194, 168, 0.15) 50%);
  border-top: 1px dashed rgba(95, 194, 168, 0.3);
  border-left: 1px dashed rgba(95, 194, 168, 0.3);
}

/* Sticky note — square, tape at top */
.llm-card--sticky-note {
  background: #fff9c4;
  border: none;
  border-radius: 1px;
  box-shadow: 2px 3px 8px rgba(0, 0, 0, 0.2);
  color: #3d3520;
  padding: 0.75rem 0.85rem;
  transform: rotate(0.8deg);
}

.llm-card--sticky-note .llm-card__tape {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 52px;
  height: 16px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.72) 0%,
    rgba(255, 255, 255, 0.38) 100%
  );
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
  z-index: 20;
  pointer-events: none;
}

/* Server LCD panel — rectangular bezel, scanlines */
.llm-card--server-lcd {
  background: #0c1412;
  border: 3px solid #1a2824;
  border-radius: 4px;
  box-shadow:
    inset 0 0 20px rgba(0, 0, 0, 0.5),
    0 4px 12px rgba(0, 0, 0, 0.4);
  color: #5fc2a8;
  font-family: ui-monospace, monospace;
  padding: 0.5rem 0.65rem;
}

.llm-card--server-lcd::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.12) 2px,
    rgba(0, 0, 0, 0.12) 4px
  );
  pointer-events: none;
  border-radius: inherit;
}

/* Spec sheet / shipping label — barcode strip at bottom */
.llm-card--spec-sheet {
  background: #f8f6f0;
  border: 1px solid #c8bfb0;
  border-radius: 2px 2px 0 0;
  color: #2d2416;
  padding: 0.65rem 0.75rem 1.5rem;
  position: relative;
}

.llm-card--spec-sheet::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 14px;
  background: repeating-linear-gradient(
    90deg,
    #1a1a1a 0,
    #1a1a1a 2px,
    #f8f6f0 2px,
    #f8f6f0 4px
  );
}

/* Inventory tray — inset compartment with lip */
.llm-card--inventory-tray {
  background: #1a2422;
  border: 2px solid #2a3834;
  border-radius: 6px;
  box-shadow:
    inset 0 3px 8px rgba(0, 0, 0, 0.4),
    0 2px 6px rgba(0, 0, 0, 0.3);
  color: var(--kit-ink);
  padding: 0.65rem 0.75rem;
}

.llm-card--inventory-tray::before {
  content: "";
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 3px;
  background: linear-gradient(180deg, #2a3834, transparent);
  border-radius: 0 0 2px 2px;
}

/* Model lab report — header stripe, report layout */
.llm-card--model-report {
  background: #141c1a;
  border: 1px solid rgba(95, 194, 168, 0.2);
  border-radius: 3px 3px 8px 3px;
  color: var(--kit-ink);
  padding: 0;
  min-height: 9rem;
  overflow: hidden;
}

.llm-card--model-report .llm-card__header {
  padding: 0.35rem 0.75rem;
  background: linear-gradient(90deg, rgba(95, 194, 168, 0.18), transparent);
  border-bottom: 1px solid rgba(95, 194, 168, 0.15);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(95, 194, 168, 0.7);
}

.llm-card--model-report .llm-card__body {
  padding: 0.65rem 0.75rem;
}

/* Redacted research folder */
.llm-card--redacted {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 2px;
  color: #666;
  padding: 0.75rem 1rem;
  position: relative;
}

.llm-card--redacted::before {
  content: "CLASSIFIED";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-12deg);
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: 0.3em;
  color: rgba(239, 68, 68, 0.25);
  border: 3px solid rgba(239, 68, 68, 0.2);
  padding: 0.25rem 0.75rem;
  pointer-events: none;
}

/* Polaroid achievement */
.llm-card--polaroid {
  background: #faf8f4;
  border: none;
  border-radius: 2px;
  box-shadow: 3px 4px 14px rgba(0, 0, 0, 0.35);
  padding: 0.5rem 0.5rem 2rem;
  color: #2d2416;
  transform: rotate(2deg);
}

.llm-card--polaroid .llm-card__body {
  background: #1a2422;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Buttons ---- */
.llm-btn {
  font-family: var(--kit-font-display);
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  border: none;
}

.llm-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.llm-btn[data-variant="secondary"] {
  padding: 0.65rem 1.2rem;
  background: var(--kit-surface-alt);
  border: 1px solid var(--kit-line);
  border-radius: var(--kit-r-control);
  color: var(--kit-ink);
}

.llm-btn[data-variant="primary"] {
  padding: 0.65rem 1.2rem;
  background: var(--kit-accent);
  border: 1px solid var(--kit-accent-deep);
  border-radius: var(--kit-r-control);
  color: #3a1b12;
}

.llm-btn[data-variant="primary"]:hover:not(:disabled) {
  background: #ec8f78;
}

.llm-btn[data-variant="ghost"] {
  padding: 0.65rem 1.2rem;
  background: transparent;
  border: 1px solid rgba(95, 194, 168, 0.35);
  border-radius: var(--kit-r-control);
  color: var(--kit-ink);
}

.llm-btn.llm-btn--invoice-pay {
  padding: 0.55rem 0.85rem;
  background: linear-gradient(180deg, #3a2f22 0%, #2d2416 55%, #241c12 100%);
  border: 1px solid #4a3f32;
  border-radius: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 2px 0 #1a140f,
    0 3px 8px rgba(45, 36, 22, 0.35);
  color: #faf8f4;
  font-size: 0.8125rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.llm-btn.llm-btn--invoice-pay:hover:not(:disabled) {
  background: linear-gradient(180deg, #45382a 0%, #352a1c 55%, #2a2116 100%);
}

.llm-btn.llm-btn--invoice-pay-unaffordable {
  padding: 0.55rem 0.85rem;
  background: repeating-linear-gradient(
    -45deg,
    #ebe4d8,
    #ebe4d8 4px,
    #e3dbd0 4px,
    #e3dbd0 8px
  );
  border: 2px dashed #b8a898;
  border-radius: 2px;
  box-shadow: inset 0 1px 3px rgba(45, 36, 22, 0.06);
  color: #8a7a68;
  font-size: 0.8125rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: not-allowed;
}

.llm-btn.llm-btn--terminal {
  padding: 0.45rem 0.85rem;
  background: #0a1210;
  border: 1px solid #5fc2a8;
  border-radius: 2px;
  color: #5fc2a8;
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.llm-btn.llm-btn--blueprint {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 2px dashed rgba(95, 194, 168, 0.5);
  border-radius: 2px;
  color: var(--kit-teal);
}

.llm-btn.llm-btn--led {
  padding: 0.35rem 0.65rem;
  background: #0a0e0c;
  border: 2px inset #1a2824;
  border-radius: 3px;
  color: var(--kit-amber);
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  text-shadow: 0 0 8px rgba(224, 169, 92, 0.5);
}

.llm-btn[data-size="sm"] {
  padding: 0.35rem 0.6rem;
  font-size: 0.625rem;
}

/* ---- Panels ---- */
.llm-panel {
  position: relative;
}

.llm-panel--glass {
  background: var(--kit-surface);
  border: 1px solid var(--kit-line);
  border-radius: var(--kit-r-surface);
  padding: 0.75rem 1rem;
}

.llm-panel--inset {
  border-radius: var(--kit-r-field);
  background: rgba(0, 0, 0, 0.12);
  padding: 0.75rem 1rem;
}

.llm-panel--server-lcd {
  background: #0c1412;
  border: 3px solid #1a2824;
  border-radius: 4px;
  padding: 0.5rem 0.65rem;
  box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.45);
  font-family: ui-monospace, monospace;
}

.llm-panel--server-lcd::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.1) 2px, rgba(0, 0, 0, 0.1) 4px);
  pointer-events: none;
  border-radius: inherit;
}

.llm-panel--terminal {
  background: #0a1210;
  border: 2px solid #243430;
  border-radius: 6px;
  padding: 0;
  overflow: hidden;
}

.llm-panel--blueprint {
  background:
    linear-gradient(rgba(95, 194, 168, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(95, 194, 168, 0.05) 1px, transparent 1px),
    #162a28;
  background-size: 16px 16px;
  border: 2px dashed rgba(95, 194, 168, 0.35);
  border-radius: 2px;
  padding: 0.75rem 1rem;
}

.llm-panel--tablet {
  background: #0c0b0f;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 0.75rem;
}

.llm-panel__label {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(244, 236, 221, 0.45);
  margin-bottom: 0.5rem;
}

/* ---- Badges ---- */
.llm-token {
  display: inline-flex;
  align-items: center;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.llm-token--teal {
  border: 1px solid rgba(95, 194, 168, 0.35);
  background: rgba(95, 194, 168, 0.12);
  color: var(--kit-teal);
  border-radius: var(--kit-r-pill);
  padding: 0.2rem 0.5rem;
}

.llm-token--amber {
  border: 1px solid rgba(224, 169, 92, 0.3);
  background: rgba(224, 169, 92, 0.1);
  color: #f0d4a8;
  border-radius: var(--kit-r-pill);
  padding: 0.2rem 0.5rem;
}

.llm-token--coral {
  border: 1px solid rgba(217, 84, 74, 0.35);
  background: rgba(217, 84, 74, 0.12);
  color: #f0a097;
  border-radius: var(--kit-r-pill);
  padding: 0.2rem 0.5rem;
}

.llm-token--muted {
  border: 1px solid rgba(244, 236, 221, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(244, 236, 221, 0.5);
  border-radius: var(--kit-r-pill);
  padding: 0.2rem 0.5rem;
}

.llm-token--stamp {
  border: 2px solid #c75d45;
  color: #c75d45;
  border-radius: 2px;
  padding: 0.15rem 0.45rem;
  transform: rotate(-4deg);
  background: rgba(199, 93, 69, 0.08);
}

.llm-token--alert {
  border: 1px solid rgba(224, 169, 92, 0.5);
  background: rgba(224, 169, 92, 0.15);
  color: #f0d4a8;
  border-radius: 2px;
  padding: 0.2rem 0.5rem;
  font-family: ui-monospace, monospace;
}

/* ---- Stat displays ---- */
.llm-stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.llm-stat__icon {
  flex-shrink: 0;
  font-family: var(--kit-font-display);
  font-weight: 800;
}

.llm-stat__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.llm-stat__label {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244, 236, 221, 0.45);
}

.llm-stat__value {
  font-family: var(--kit-font-display);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

/* LED counter / arcade scoreboard */
.llm-stat--led {
  background: #0a0e0c;
  border: 2px inset #1a2824;
  border-radius: 4px;
  padding: 0.35rem 0.65rem;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
}

.llm-stat--led .llm-stat__value {
  font-size: 1.75rem;
  text-shadow: 0 0 12px currentColor;
}

.llm-stat--scoreboard .llm-stat__value {
  font-size: 1.5rem;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
}

.llm-stat--lcd {
  font-family: ui-monospace, monospace;
}

.llm-stat--lcd .llm-stat__value {
  font-size: 0.75rem;
  color: #5fc2a8;
}

.llm-stat--tone-amber .llm-stat__value { color: var(--kit-amber); }
.llm-stat--tone-teal .llm-stat__value { color: var(--kit-teal); }
.llm-stat--tone-coral .llm-stat__value { color: #f0a097; }
.llm-stat--tone-cream .llm-stat__value { color: var(--kit-ink); }

.llm-stat-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.75rem;
  align-items: center;
}

/* ---- Toasts / notifications ---- */
.llm-toast {
  position: relative;
  overflow: hidden;
  pointer-events: auto;
}

.llm-toast__progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
}

.llm-toast__inner {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
}

.llm-toast__avatar {
  flex-shrink: 0;
}

.llm-toast__content {
  flex: 1;
  min-width: 0;
}

.llm-toast__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.llm-toast__title {
  font-weight: 700;
  font-size: 0.8125rem;
}

.llm-toast__dismiss {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  padding: 0.15rem;
  font-size: 0.75rem;
}

.llm-toast__dismiss:hover {
  opacity: 1;
}

/* Radio dispatch — amber terminal alert strip */
.llm-toast--dispatch {
  background: #1a1810;
  border: 1px solid rgba(224, 169, 92, 0.4);
  border-left: 4px solid var(--kit-amber);
  border-radius: 2px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  color: #f0d4a8;
  font-family: ui-monospace, monospace;
  max-width: 18rem;
}

.llm-toast--dispatch .llm-toast__title {
  font-size: 0.5625rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--kit-amber);
}

/* Social feed card */
.llm-toast--social {
  background: rgba(10, 14, 12, 0.95);
  border: 1px solid rgba(29, 155, 240, 0.25);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: var(--kit-ink);
  max-width: 21rem;
}

/* Terminal alert */
.llm-toast--terminal-alert {
  background: #0a1210;
  border: 2px solid rgba(224, 169, 92, 0.5);
  border-radius: 4px;
  color: #f0d4a8;
  font-family: ui-monospace, monospace;
  max-width: 14rem;
}

.llm-toast--terminal-alert::before {
  content: "⚠ ALERT";
  display: block;
  padding: 0.25rem 0.65rem;
  background: rgba(224, 169, 92, 0.15);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.15em;
}

/* Achievement polaroid toast */
.llm-toast--achievement {
  background: #faf8f4;
  border: none;
  border-radius: 2px;
  box-shadow: 4px 6px 18px rgba(0, 0, 0, 0.4);
  color: #2d2416;
  transform: rotate(-1deg);
  max-width: 14rem;
}

.llm-toast--achievement .llm-toast__title {
  font-family: var(--kit-font-display);
  color: #c75d45;
}


`;
