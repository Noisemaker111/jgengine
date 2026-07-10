import { seededStreams } from "@jgengine/core/random/rng";
import { VILLAGES, distanceBetweenVillages, villageById } from "../world/villages";

export interface DeliveryJobDef {
  readonly id: string;
  readonly originId: string;
  readonly destinationId: string;
  readonly distance: number;
  readonly deadlineSeconds: number;
}

function deadlineForDistance(distance: number): number {
  if (distance < 45) return 40;
  if (distance < 95) return 65;
  return 95;
}

function buildJobs(): DeliveryJobDef[] {
  const jobs: DeliveryJobDef[] = [];
  for (const origin of VILLAGES) {
    for (const destination of VILLAGES) {
      if (origin.id === destination.id) continue;
      const distance = distanceBetweenVillages(origin.id, destination.id);
      jobs.push({
        id: `${origin.id}_to_${destination.id}`,
        originId: origin.id,
        destinationId: destination.id,
        distance,
        deadlineSeconds: deadlineForDistance(distance),
      });
    }
  }
  return jobs;
}

export const DELIVERY_JOBS: readonly DeliveryJobDef[] = buildJobs();

export const REQUIRED_DELIVERIES = 8;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

export function jobQueueForSeed(seed: string): readonly string[] {
  const rng = seededStreams(seed)("delivery-order");
  return shuffle(DELIVERY_JOBS, rng).map((job) => job.id);
}

export function jobById(id: string): DeliveryJobDef {
  const found = DELIVERY_JOBS.find((job) => job.id === id);
  if (found === undefined) throw new Error(`courier-zero: unknown delivery job "${id}"`);
  return found;
}

export function jobLabel(id: string): string {
  const job = jobById(id);
  return `${villageById(job.originId).name} → ${villageById(job.destinationId).name}`;
}
