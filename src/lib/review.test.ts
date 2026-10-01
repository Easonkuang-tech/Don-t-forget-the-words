import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import { buildReviewQuestions } from "./review";

function card(id: string, index: number): Card {
  return {
    id,
    deckId: "deck_1",
    contentType: "word",
    english: `word ${index}`,
    chinese: `含义 ${index}`,
    target: `word ${index}`,
    sentence: `This is word ${index} in context.`,
    sentenceTranslation: `这是上下文中的 word ${index}。`,
    phonetic: "",
    definitionEn: "",
    definitionZh: "",
    partOfSpeech: "",
    tags: [],
    source: "manual",
    level: 0,
    nextReviewAt: 0,
    lastReviewedAt: null,
    reviewCount: 0,
    correctCount: 0,
    createdAt: index,
    updatedAt: index
  };
}

describe("buildReviewQuestions", () => {
  it("assigns mixed modes as evenly as possible", () => {
    const cards = Array.from({ length: 10 }, (_, index) =>
      card(`card_${index}`, index)
    );
    const questions = buildReviewQuestions(cards, cards, "mixed", () => 0.42);
    const counts = questions.reduce<Record<string, number>>((result, item) => {
      result[item.mode] = (result[item.mode] ?? 0) + 1;
      return result;
    }, {});

    expect(Object.values(counts).sort()).toEqual([3, 3, 4]);
    expect(questions).toHaveLength(cards.length);
    expect(new Set(questions.map((item) => item.card.id)).size).toBe(
      cards.length
    );
  });

  it("balances the correct option across A/B/C/D", () => {
    const cards = Array.from({ length: 8 }, (_, index) =>
      card(`card_${index}`, index)
    );
    const questions = buildReviewQuestions(cards, cards, "choice", () => 0.37);
    const counts = questions.reduce<number[]>(
      (result, item) => {
        result[item.correctOptionIndex] += 1;
        return result;
      },
      [0, 0, 0, 0]
    );

    expect(counts).toEqual([2, 2, 2, 2]);
    expect(
      questions.every((item) => item.options.length === 4)
    ).toBe(true);
  });

  it("falls back to Chinese recall when a card has no example sentence", () => {
    const withoutSentence = { ...card("card_1", 1), sentence: "" };
    const questions = buildReviewQuestions(
      [withoutSentence],
      [withoutSentence],
      "cloze",
      () => 0.5
    );

    expect(questions[0].mode).toBe("typing");
  });
});
