import { describe, expect, it } from "vitest";
import type { Card, ReviewLog } from "../types";
import {
  calculateStreak,
  classifyCard,
  getForecast
} from "./stats";

const baseTime = new Date("2026-09-12T08:00:00+09:00").getTime();

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    deckId: "deck_1",
    contentType: "word",
    english: "example",
    chinese: "例子",
    target: "example",
    sentence: "",
    sentenceTranslation: "",
    phonetic: "",
    definitionEn: "",
    definitionZh: "",
    partOfSpeech: "",
    tags: [],
    source: "manual",
    level: 0,
    nextReviewAt: baseTime,
    lastReviewedAt: null,
    reviewCount: 0,
    correctCount: 0,
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides
  };
}

function log(
  reviewedAt: number,
  overrides: Partial<ReviewLog> = {}
): ReviewLog {
  return {
    id: `log_${reviewedAt}`,
    cardId: "card_1",
    mode: "choice",
    reviewScope: "focused",
    answer: "例子",
    correctAnswer: "例子",
    isCorrect: true,
    attempts: 1,
    systemRating: "good",
    userRating: "good",
    reactionTimeMs: 1_000,
    answerTimeMs: 2_000,
    totalTimeMs: 3_000,
    speedBand: "fast",
    levelBefore: 0,
    levelAfter: 1,
    nextReviewAt: reviewedAt + 1_000,
    affectsSchedule: true,
    reviewedAt,
    ...overrides
  };
}

describe("stats", () => {
  it("classifies recent repeated mistakes as difficult", () => {
    expect(
      classifyCard(card({ reviewCount: 2 }), [
        log(baseTime, { isCorrect: false, userRating: "hard" }),
        log(baseTime - 1, { isCorrect: false, userRating: "forgot" })
      ])
    ).toBe("difficult");
  });

  it("classifies a stable high-level card as mastered", () => {
    expect(
      classifyCard(card({ level: 5, reviewCount: 5 }), [
        log(baseTime, { userRating: "good", levelAfter: 5 })
      ])
    ).toBe("mastered");
  });

  it("calculates a streak across consecutive days", () => {
    expect(
      calculateStreak(
        [
          log(baseTime),
          log(baseTime - 24 * 60 * 60 * 1_000),
          log(baseTime - 2 * 24 * 60 * 60 * 1_000)
        ],
        baseTime
      )
    ).toBe(3);
  });

  it("builds a seven-day forecast", () => {
    const points = getForecast([card({ nextReviewAt: baseTime })], baseTime);
    expect(points).toHaveLength(7);
    expect(points[0].count).toBe(1);
  });
});
