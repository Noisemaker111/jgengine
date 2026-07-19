import { describe, expect, test } from "bun:test";
import { leveling, type LevelingStatAccess } from "./progression";

interface SavedPool {
  current: number;
  max: number;
}

interface ExistingSave {
  players: Record<string, Record<string, SavedPool>>;
}

function accessFor(read: () => ExistingSave, write: (next: ExistingSave) => void): LevelingStatAccess {
  return {
    get(userId, statId) {
      return read().players[userId]?.[statId] ?? null;
    },
    set(userId, statId, patch) {
      const save = read();
      const player = save.players[userId];
      const pool = player?.[statId];
      if (player === undefined || pool === undefined) return false;
      write({
        ...save,
        players: {
          ...save.players,
          [userId]: {
            ...player,
            [statId]: {
              current: patch.current ?? pool.current,
              max: patch.max ?? pool.max,
            },
          },
        },
      });
      return true;
    },
  };
}

describe("portable leveling adoption", () => {
  test("caller-owned state gains several levels, emits each event, and resumes from JSON", () => {
    let save: ExistingSave = {
      players: {
        player_1: {
          experience: { current: 0, max: 100 },
          rank: { current: 1, max: 10 },
        },
      },
    };
    const track = leveling({
      xpForLevel: { kind: "const", value: 100 },
      maxLevel: 10,
      xpStat: "experience",
      levelStat: "rank",
    });
    let access = accessFor(() => save, (next) => { save = next; });
    const events: number[] = [];

    expect(track.grantXp(access, "player_1", 350, (level) => events.push(level))).toBe(3);
    expect(save.players.player_1).toEqual({
      experience: { current: 50, max: 100 },
      rank: { current: 4, max: 10 },
    });
    expect(events).toEqual([2, 3, 4]);

    save = JSON.parse(JSON.stringify(save)) as ExistingSave;
    access = accessFor(() => save, (next) => { save = next; });
    expect(track.grantXp(access, "player_1", 50, (level) => events.push(level))).toBe(1);
    expect(save.players.player_1).toEqual({
      experience: { current: 0, max: 100 },
      rank: { current: 5, max: 10 },
    });
    expect(events).toEqual([2, 3, 4, 5]);
  });
});
