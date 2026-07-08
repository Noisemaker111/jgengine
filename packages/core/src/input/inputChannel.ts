export interface InputFrame {
  held: ReadonlySet<string>;
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  yaw: number;
  pitch: number;
  pointerLocked: boolean;
}

export interface InputChannel {
  publish(frame: InputFrame): void;
  isHeld(action: string): boolean;
  axis(): { forward: number; right: number };
  aim(): { yaw: number; pitch: number };
  jumpHeld(): boolean;
  sprintHeld(): boolean;
  pointerLocked(): boolean;
  snapshot(): InputFrame;
}

function neutralFrame(): InputFrame {
  return {
    held: new Set(),
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    yaw: 0,
    pitch: 0,
    pointerLocked: false,
  };
}

export function createInputChannel(): InputChannel {
  let frame = neutralFrame();

  return {
    publish(next) {
      frame = next;
    },
    isHeld(action) {
      return frame.held.has(action);
    },
    axis() {
      return { forward: frame.forward, right: frame.right };
    },
    aim() {
      return { yaw: frame.yaw, pitch: frame.pitch };
    },
    jumpHeld() {
      return frame.jump;
    },
    sprintHeld() {
      return frame.sprint;
    },
    pointerLocked() {
      return frame.pointerLocked;
    },
    snapshot() {
      return frame;
    },
  };
}
