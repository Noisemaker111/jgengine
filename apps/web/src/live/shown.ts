/**
 * Whether a live element can be seen: on screen and in a visible tab. Every animated demo on the
 * site runs only while shown, so a page scrolled past its demos, or a background tab, costs nothing.
 */
export interface ShownGate {
  shown(): boolean;
  setOnScreen(onScreen: boolean): void;
  setTabHidden(hidden: boolean): void;
}

/** The rule itself, without the DOM: `onChange` runs when `shown()` flips. */
export function createShownGate(onChange: (shown: boolean) => void, tabHidden = false): ShownGate {
  let onScreen = true;
  let hidden = tabHidden;
  let was = onScreen && !hidden;
  const update = () => {
    const now = onScreen && !hidden;
    if (now === was) return;
    was = now;
    onChange(now);
  };
  return {
    shown: () => was,
    setOnScreen(next) {
      onScreen = next;
      update();
    },
    setTabHidden(next) {
      hidden = next;
      update();
    },
  };
}

/** Tracks `element` with an IntersectionObserver and the tab's visibility. */
export function watchShown(element: Element, onChange: (shown: boolean) => void): { shown(): boolean; dispose(): void } {
  const gate = createShownGate(onChange, document.hidden);
  const onVisibility = () => gate.setTabHidden(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  const intersection = new IntersectionObserver((entries) => {
    gate.setOnScreen(entries.some((entry) => entry.isIntersecting));
  });
  intersection.observe(element);
  return {
    shown: gate.shown,
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      intersection.disconnect();
    },
  };
}
