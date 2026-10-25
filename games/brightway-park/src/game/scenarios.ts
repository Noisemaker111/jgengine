import type { MissionDef } from "@jgengine/core/mission/mission";

import { DAY_LENGTH } from "./catalog";

/**
 * Three park scenarios as content: each is a timed `survive` mission whose branches read the park's
 * world facts at the close, plus the fail states that end a run early. `park.ts` declares each one
 * as a job on the park's world, so the world's own mission runtime runs it and saves it with the park.
 */

export interface ScenarioDef {
  id: string;
  title: string;
  blurb: string;
  /** What the park must be true at the close. */
  goal: string;
  /** Money the park opens with. */
  cash: number;
  mission: MissionDef;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "opening_weekend",
    title: "Opening Weekend",
    blurb: "Two days, one quiet seaside fair, and a gate that has to earn its keep.",
    goal: "Take $2,000 across two days",
    cash: 6000,
    mission: {
      id: "opening_weekend",
      title: "Opening Weekend",
      description: "Take $2,000 at the gate across two days without running out of cash.",
      fail: [
        { id: "broke", message: "The till ran dry before the weekend was out." },
        { id: "short", message: "The weekend closed short of $2,000." },
      ],
      objectives: [
        {
          id: "weekend",
          kind: "survive",
          label: "Take $2,000 across two days",
          duration: DAY_LENGTH * 2,
          failOn: [{ kind: "fact", fact: "park.cash", atMost: 0, to: "broke", message: "The till ran dry." }],
          branches: [
            { to: "done", when: { fact: "park.scenario_revenue", atLeast: 2000 }, label: "Weekend target met" },
            { to: "short", when: { fact: "park.scenario_revenue" }, label: "Weekend target missed" },
          ],
        },
      ],
      rewards: { economy: { cash: 1500 } },
    },
  },
  {
    id: "star_attraction",
    title: "Star Attraction",
    blurb: "Three days to turn a handful of rides into a 420-star park people talk about.",
    goal: "Reach a 420 star rating by the end of day three",
    cash: 7000,
    mission: {
      id: "star_attraction",
      title: "Star Attraction",
      description: "Reach a park rating of 420 within three days with guests still smiling.",
      fail: [
        { id: "walkout", message: "The crowd turned miserable and stopped coming." },
        { id: "broke", message: "The park ran out of cash chasing the rating." },
        { id: "quiet", message: "Three days gone and the park never became a star attraction." },
      ],
      objectives: [
        {
          id: "season",
          kind: "survive",
          label: "Reach 420 stars by the end of day three",
          duration: DAY_LENGTH * 3,
          failOn: [
            { kind: "fact", fact: "park.mood", atMost: 20, to: "walkout", message: "Guest mood collapsed below 20%." },
            { kind: "fact", fact: "park.cash", atMost: 0, to: "broke", message: "The till ran dry." },
          ],
          branches: [
            { to: "done", when: { fact: "park.rating", atLeast: 420 }, label: "Star attraction" },
            { to: "quiet", when: { fact: "park.rating" }, label: "Short of 420 stars" },
          ],
        },
      ],
      rewards: { economy: { cash: 2500 } },
    },
  },
  {
    id: "full_house",
    title: "Full House",
    blurb: "One day to pack the midway: eighty visitors through the gate before the lights go down.",
    goal: "Bring 80 visitors through the gate in one day",
    cash: 5000,
    mission: {
      id: "full_house",
      title: "Full House",
      description: "Draw 80 visitors in a single day and keep the till in the black.",
      fail: [
        { id: "broke", message: "The park could not afford the day." },
        { id: "thin", message: "The midway stayed quiet - under 80 visitors came through." },
      ],
      objectives: [
        {
          id: "day",
          kind: "survive",
          label: "Bring 80 visitors through the gate",
          duration: DAY_LENGTH,
          failOn: [{ kind: "fact", fact: "park.cash", atMost: 0, to: "broke", message: "The till ran dry." }],
          branches: [
            { to: "done", when: { fact: "park.scenario_visitors", atLeast: 80 }, label: "Full house" },
            { to: "thin", when: { fact: "park.scenario_visitors" }, label: "Quiet day" },
          ],
        },
      ],
      rewards: { economy: { cash: 1800 } },
    },
  },
];

export function scenarioDef(id: string): ScenarioDef | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}
