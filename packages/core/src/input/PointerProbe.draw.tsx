import { useRef } from "@jgengine/core/ui/jsx";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import type { PointerService } from "./pointerService.draw";

/**
 * Binds the pointer service to the live camera, scene and canvas, and feeds it DOM pointer
 * position (with pointer-lock awareness). `groundHeightAt` lets clicks land on terrain.
 * @internal
 */
export function pointerProbeDraw(service: PointerService, getGroundHeightAt: () => ((x: number, z: number) => number) | undefined): EngineDraw {
  let boundCamera: unknown = null;
  let boundScene: unknown = null;
  let boundWidth = -1;
  let boundHeight = -1;
  let boundGround: unknown = null;
  let removeListeners: (() => void) | null = null;
  const syncBind = (state: EngineFrameState) => {
    const groundHeightAt = getGroundHeightAt();
    if (
      boundCamera === state.camera &&
      boundScene === state.scene &&
      boundWidth === state.size.width &&
      boundHeight === state.size.height &&
      boundGround === groundHeightAt
    ) {
      return;
    }
    boundCamera = state.camera;
    boundScene = state.scene;
    boundWidth = state.size.width;
    boundHeight = state.size.height;
    boundGround = groundHeightAt;
    service.bind({
      camera: state.camera,
      scene: state.scene,
      width: state.size.width,
      height: state.size.height,
      ...(groundHeightAt === undefined ? {} : { groundHeightAt }),
    });
  };
  return {
    mount(state: EngineFrameState) {
      syncBind(state);
      const el = state.gl.domElement;
      let locked = false;
      const onMove = (event: PointerEvent) => {
        if (locked) return;
        const rect = el.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        service.setState({ x, y, present: true });
      };
      const onLeave = () => {
        if (!locked) service.setState({ x: 0, y: 0, present: false });
      };
      const onLockChange = () => {
        locked = document.pointerLockElement === el;
        if (locked) service.setState({ x: 0, y: 0, present: true });
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      document.addEventListener("pointerlockchange", onLockChange);
      removeListeners = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        document.removeEventListener("pointerlockchange", onLockChange);
      };
    },
    update: syncBind,
    dispose(_state: EngineFrameState) {
      removeListeners?.();
      removeListeners = null;
      service.bind(null);
      boundCamera = null;
      boundScene = null;
      boundWidth = -1;
      boundHeight = -1;
      boundGround = null;
    },
  };
}

/** Binds the pointer service to the live camera and scene; `groundHeightAt` lets clicks land on terrain. */
export function PointerProbe({ service, groundHeightAt }: { service: PointerService; groundHeightAt?: (x: number, z: number) => number }) {
  const latest = useRef(groundHeightAt);
  latest.current = groundHeightAt;
  useEngineDraw(() => pointerProbeDraw(service, () => latest.current), [service]);
  return null;
}
