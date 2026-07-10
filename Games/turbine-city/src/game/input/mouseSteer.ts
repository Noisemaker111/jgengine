export interface MouseSteer {
  attach(): void;
  detach(): void;
  sample(): { x: number; y: number };
}

export function createMouseSteer(): MouseSteer {
  let x = 0;
  let y = 0;
  let attached = false;

  function onMove(event: MouseEvent): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    x = Math.min(1, Math.max(-1, (event.clientX / w) * 2 - 1));
    y = Math.min(1, Math.max(-1, (event.clientY / h) * 2 - 1));
  }

  return {
    attach() {
      if (attached || typeof window === "undefined") return;
      attached = true;
      window.addEventListener("mousemove", onMove);
    },
    detach() {
      if (!attached || typeof window === "undefined") return;
      attached = false;
      window.removeEventListener("mousemove", onMove);
      x = 0;
      y = 0;
    },
    sample() {
      return { x, y };
    },
  };
}
