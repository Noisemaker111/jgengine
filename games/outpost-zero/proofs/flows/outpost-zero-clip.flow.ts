import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    await f.hold("KeyW", { ms: 400 });
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    for (let i = 0; i < 5; i += 1) {
      await f.command("fire", {});
      await f.wait(115);
    }
    await f.wait(350);
    await f.expect((p) => p.health > 0, "arrival: still standing after the firefight");
  },
});
