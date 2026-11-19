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
  hud: 20,
  hudRaised: 30,
  rackMenuOverlay: 50,
  tablet: 105,
  /**
   * On-screen walk / jump / interact controls. Deliberately ABOVE `tablet` so a
   * button press always wins its own footprint instead of falling through to the
   * collapsed tablet's peek handle. Safe because the controls unmount while the
   * tablet is open (see PlayMovementHud), so the open sheet never fights them.
   */
  touchControls: 106,
  notification: 140,
  settingsModal: 180,
  modal: 200,
} as const;
