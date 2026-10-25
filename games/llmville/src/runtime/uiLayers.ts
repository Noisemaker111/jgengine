/**
 * Single source of truth for overlay stacking order.
 *
 * The in-world HUD is a stack of full-screen, absolutely/fixed-positioned
 * layers. Before this file each one carried a hand-picked `z-[NNN]` Tailwind
 * class scattered across a dozen components, which made it impossible to see —
 * from the code — which layer would intercept a touch. List the order here and
 * read it top to bottom.
 *
 * Higher number = closer to the player. Apply with an inline
 * `style={{ zIndex: UI_LAYER.x }}` rather than a `z-[...]` class: Tailwind's JIT
 * only generates arbitrary z-index utilities it can see as literal strings, so a
 * value pulled from this constant must go through `style`.
 */
export const UI_LAYER = {
  /** In-world HUD: resource panel, interaction hints, diagnostics. */
  hud: 20,
  /** Raised HUD accents over `hud` (launch celebration, "return inside"). */
  hudRaised: 30,
  /** Rack config and other blocking in-world menus. */
  rackMenuOverlay: 50,
  /** Sliding tablet sheet — collapsed peek handle and the open app surface. */
  tablet: 105,
  /**
   * On-screen walk / jump / interact controls. Deliberately ABOVE `tablet` so a
   * button press always wins its own footprint instead of falling through to the
   * collapsed tablet's peek handle. Safe because the controls unmount while the
   * tablet is open (see PlayMovementHud), so the open sheet never fights them.
   */
  touchControls: 106,
  /** Toast notifications that float over the controls. */
  notification: 140,
  /** Settings modal. */
  settingsModal: 180,
  /** Model detail / reveal / training-commitment modals — top of the normal stack. */
  modal: 200,
  /** Dev-only hit-test inspector (`?debug=ui`) — always on top of everything. */
  debugInspector: 2_147_483_000,
} as const;
