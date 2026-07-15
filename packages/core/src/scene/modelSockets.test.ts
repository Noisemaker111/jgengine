import { describe, expect, test } from "bun:test";

import { readNamedSockets, type ModelNode } from "./modelSockets";

const model: ModelNode = {
  name: "pole",
  position: { x: 0, y: 0, z: 0 },
  children: [
    { name: "trunk", position: { x: 0, y: 3, z: 0 } },
    { name: "wire_left", position: { x: -0.5, y: 6, z: 0 } },
    { name: "wire_right", position: { x: 0.5, y: 6, z: 0 } },
    { name: "socket_top", position: { x: 0, y: 6.5, z: 0 } },
  ],
};

describe("readNamedSockets", () => {
  test("collects socket-named nodes, sorted top-down then left-to-right", () => {
    const sockets = readNamedSockets(model);
    expect(sockets.map((socket) => socket.name)).toEqual(["socket_top", "wire_left", "wire_right"]);
    expect(sockets[0]!.offset).toEqual([0, 6.5, 0]);
  });

  test("returns empty when nothing matches", () => {
    expect(readNamedSockets({ name: "plain", position: { x: 0, y: 0, z: 0 } })).toEqual([]);
  });

  test("honors a custom pattern", () => {
    const sockets = readNamedSockets(model, /trunk/);
    expect(sockets.map((socket) => socket.name)).toEqual(["trunk"]);
  });
});
