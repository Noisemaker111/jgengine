import { describe, expect, test } from "bun:test";
import { content } from "./content";
import { player } from "./entities/players/catalog";
import { drone_grunt } from "./entities/enemies/catalog";

describe("content.entityById", () => {
  test("reads catalog fields live, not a snapshot baked at import time", () => {
    const originalWalkSpeed = player.walkSpeed;
    try {
      player.walkSpeed = originalWalkSpeed + 1;
      expect(content.entityById?.(player.id)?.movement?.walkSpeed).toBe(originalWalkSpeed + 1);
    } finally {
      player.walkSpeed = originalWalkSpeed;
    }
  });

  test("reflects live edits to enemy catalog defs too", () => {
    const originalWalkSpeed = drone_grunt.walkSpeed;
    try {
      drone_grunt.walkSpeed = originalWalkSpeed + 1;
      expect(content.entityById?.(drone_grunt.id)?.movement?.walkSpeed).toBe(originalWalkSpeed + 1);
    } finally {
      drone_grunt.walkSpeed = originalWalkSpeed;
    }
  });
});
