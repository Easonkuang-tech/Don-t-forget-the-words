import type {
  Card,
  Rating,
  ReviewMode,
  SpeedBand
} from "../types";
import { clamp, DAY_MS, MINUTE_MS } from "./format";

export const REVIEW_INTERVAL_MS = [
  10 * MINUTE_MS,
  DAY_MS,
  2 * DAY_MS,
  4 * DAY_MS,
  7 * DAY_MS,
  15 * DAY_MS,
  30 * DAY_MS
] as const;

const SPEED_THRESHOLDS: Record<
  ReviewMode,
  { fast: number; normal: number }
> = {
  choice: { fast: 4_000, normal: 12_000 },
  typing: { fast: 8_000, normal: 20_000 },
  cloze: { fast: 10_000, normal: 25_000 }
};

const RATING_MODIFIERS: Record<Rating, number> = {
  forgot: -2,
  hard: -1,
  good: 0,
  easy: 1
};

export function getSpeedBand(
  mode: ReviewMode,
  elapsedMilliseconds: number
): SpeedBand {
  const threshold = SPEED_THRESHOLDS[mode];
  if (elapsedMilliseconds <= threshold.fast) {
    return "fast";
  }
  if (elapsedMilliseconds <= threshold.normal) {
    return "normal";
  }
  return "slow";
}

export interface ReviewPerformance {
  isCorrect: boolean;
  attempts: number;
  mode: ReviewMode;
  elapsedMilliseconds: number;
}

export function suggestRating(performance: ReviewPerformance): Rating {
  if (!performance.isCorrect) {
    return "forgot";
  }
  if (performance.attempts > 1) {
    return "hard";
  }

  const speed = getSpeedBand(
    performance.mode,
    performance.elapsedMilliseconds
  );
  if (speed === "fast") {
    return "easy";
  }
  if (speed === "normal") {
    return "good";
  }
  return "hard";
}

export interface ScheduleInput {
  card: Pick<Card, "level">;
  performance: ReviewPerformance;
  userRating: Rating;
  now: number;
}

export interface ScheduleResult {
  levelBefore: number;
  levelAfter: number;
  nextReviewAt: number;
  baseChange: number;
  ratingChange: number;
  suggestedRating: Rating;
  speedBand: SpeedBand;
}

export function calculateSchedule(input: ScheduleInput): ScheduleResult {
  const { card, performance, userRating, now } = input;
  const levelBefore = clamp(Math.round(card.level), 0, 6);
  const suggestedRating = suggestRating(performance);

  let baseChange: number;
  if (!performance.isCorrect) {
    baseChange = -levelBefore;
  } else if (performance.attempts > 1) {
    baseChange = 0;
  } else {
    baseChange = 1;
  }

  const ratingChange = RATING_MODIFIERS[userRating];
  const levelAfter = clamp(levelBefore + baseChange + ratingChange, 0, 6);
  const nextReviewAt = now + REVIEW_INTERVAL_MS[levelAfter];

  return {
    levelBefore,
    levelAfter,
    nextReviewAt,
    baseChange,
    ratingChange,
    suggestedRating,
    speedBand: getSpeedBand(
      performance.mode,
      performance.elapsedMilliseconds
    )
  };
}
