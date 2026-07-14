import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { MESSAGE_SECONDS } from "./config";
import { pinballHandle } from "./store";

export const uiScenario: UiPreviewScenario = (ctx) => {
  const store = pinballHandle.read(ctx);
  store.reset("preview-showcase");
  const sim = store.sim;

  sim.phase = "play";
  sim.score = 148_360;
  sim.ballIndex = 2;
  sim.ballsRemaining = 2;
  sim.multiplierIndex = 2;
  sim.accBonus = 21;
  sim.dropCompletions = 1;
  sim.spotBonusLit = true;
  sim.rolloverLit = [true, false, true];
  sim.ballStartScore = 96_000;
  sim.ballTimer = 9;

  const drops = sim.table.dropTargets;
  for (let i = 0; i < drops.length; i += 1) {
    const d = drops[i];
    if (d) d.up = i === 1;
  }

  const bumpers = sim.table.bumpers;
  if (bumpers[0]) bumpers[0].flash = 1;
  if (bumpers[2]) bumpers[2].flash = 0.55;
  const slings = sim.table.slingshots;
  if (slings[0]) slings[0].flash = 0.7;

  const right = sim.table.flippers[1];
  right.up = true;
  right.angle = right.active;
  right.glow = 1;
  const left = sim.table.flippers[0];
  left.angle = left.rest;

  sim.ball.x = 122;
  sim.ball.y = 296;
  sim.ball.vx = -30;
  sim.ball.vy = 120;

  sim.events = [
    { seq: 6, label: "SPOT BONUS", amount: 5000, kind: "special" },
    { seq: 5, label: "BUMPER", amount: 100, kind: "bumper" },
    { seq: 4, label: "DROP", amount: 260, kind: "drop" },
    { seq: 3, label: "BONUS 3X", amount: 1000, kind: "special" },
    { seq: 2, label: "ROLLOVER", amount: 120, kind: "rollover" },
    { seq: 1, label: "SLING", amount: 50, kind: "sling" },
  ];
  sim.message = "SPOT BONUS";
  sim.messageKind = "special";
  sim.messageTimer = MESSAGE_SECONDS;

  store.sync();
};
