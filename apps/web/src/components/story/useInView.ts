import { useEffect, useRef } from "@jgengine/core/ui/jsx";

/**
 * Marks an element `data-armed` once it is on a page with JavaScript and motion allowed, then
 * `data-in` when it first scrolls into view, so CSS can play an entrance once. Without JavaScript,
 * or with reduced motion, neither attribute is set and the element shows in its final state.
 */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.setAttribute("data-armed", "");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        el.setAttribute("data-in", "");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}
