import { describe, expect, test } from "bun:test";
import { advanceTutorialNode, TUTORIAL_NODE, type TutorialNode } from "@llmville/game/tutorial/tutorialMachine";
import { MIN_SCRAPED_DATA_TOKENS, REQUIRED_TUTORIAL_GPU_COUNT, type TutorialWorldSignals } from "@llmville/game/tutorial/tutorialProgress";

const ORDER: readonly TutorialNode[] = [
  TUTORIAL_NODE.openTablet, TUTORIAL_NODE.placeRack, TUTORIAL_NODE.buyGpus, TUTORIAL_NODE.installGpus,
  TUTORIAL_NODE.licenseScraper, TUTORIAL_NODE.scrapeTokens, TUTORIAL_NODE.fineTune, TUTORIAL_NODE.revealModel, TUTORIAL_NODE.serve,
];

function stepDone(node: TutorialNode, s: TutorialWorldSignals): boolean {
  switch (node) {
    case TUTORIAL_NODE.openTablet:
    case TUTORIAL_NODE.placeRack: return s.rackPlaced;
    case TUTORIAL_NODE.buyGpus: return s.ownedGpuCount >= REQUIRED_TUTORIAL_GPU_COUNT;
    case TUTORIAL_NODE.installGpus: return s.installedGpuCount >= REQUIRED_TUTORIAL_GPU_COUNT;
    case TUTORIAL_NODE.licenseScraper: return s.hasLicensedScraper;
    case TUTORIAL_NODE.scrapeTokens: return s.scrapingAllocated && s.dataTokens >= MIN_SCRAPED_DATA_TOKENS;
    case TUTORIAL_NODE.fineTune: return s.fineTunedModelCount >= 1;
    case TUTORIAL_NODE.revealModel: return s.hasRevealedPlayerModel;
    case TUTORIAL_NODE.serve: return s.playerServingModelCount >= 1;
    default: return false;
  }
}

function* signalGrid(): Generator<TutorialWorldSignals> {
  for (let bits = 0; bits < 512; bits += 1) {
    const on = (bit: number) => Math.floor(bits / 2 ** bit) % 2 === 1;
    yield {
      rackPlaced: on(0),
      ownedGpuCount: on(1) ? REQUIRED_TUTORIAL_GPU_COUNT : REQUIRED_TUTORIAL_GPU_COUNT - 1,
      installedGpuCount: on(2) ? REQUIRED_TUTORIAL_GPU_COUNT : 0,
      hasLicensedScraper: on(3),
      scrapingAllocated: on(4),
      dataTokens: on(5) ? MIN_SCRAPED_DATA_TOKENS : MIN_SCRAPED_DATA_TOKENS - 1,
      fineTunedModelCount: on(6) ? 1 : 0,
      hasRevealedPlayerModel: on(7),
      playerServingModelCount: on(8) ? 1 : 0,
    };
  }
}

describe("tutorial steps on the engine onboarding", () => {
  test("each step finishes in order while its condition holds, from every node", () => {
    for (const signals of signalGrid()) {
      for (const [start, node] of ORDER.entries()) {
        let index = start;
        while (index < ORDER.length && stepDone(ORDER[index] ?? TUTORIAL_NODE.complete, signals)) index += 1;
        const expectedNode = ORDER[index] ?? TUTORIAL_NODE.complete;
        expect(advanceTutorialNode(node, signals)).toEqual({ node: expectedNode, completed: expectedNode === TUTORIAL_NODE.complete });
      }
    }
  });

  test("bootstrap waits and complete stays complete", () => {
    for (const signals of signalGrid()) {
      expect(advanceTutorialNode(TUTORIAL_NODE.bootstrap, signals)).toEqual({ node: TUTORIAL_NODE.bootstrap, completed: false });
      expect(advanceTutorialNode(TUTORIAL_NODE.complete, signals)).toEqual({ node: TUTORIAL_NODE.complete, completed: true });
    }
  });
});
