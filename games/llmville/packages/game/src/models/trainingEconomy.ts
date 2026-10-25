/**
 * Training economy: job duration and schema union sources for training jobs.
 */

/**
 * Catalog UI hint for base-model cards (seconds shown on “Fine-tune / Distill” copy).
 * Live training duration is computed on the server from committed data tokens or distill pool vs
 * `drainTokensPerSecond` (= base `tokensPerSecond` × allocated training TFLOPs).
 */
export const BASE_MODEL_TRAINING_REFERENCE_DURATION_MS = 60_000;

export const TRAINING_JOB_MIN_DURATION_MS_POST_TRAIN = 5_000;

export const TRAINING_TYPE_VALUES = ["post_train"] as const;
