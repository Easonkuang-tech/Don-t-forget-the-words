import { describe, expect, it } from "vitest";
import { calculateSchedule, getSpeedBand, suggestRating } from "./scheduler";

const now = new Date("2026-09-12T00:00:00+09:00").getTime();

describe("scheduler", () => {
  it("uses the agreed speed boundaries", () => {
    expect(getSpeedBand("choice", 4_000)).toBe("fast");
    expect(getSpeedBand("choice", 4_001)).toBe("normal");
    expect(getSpeedBand("typing", 20_001)).toBe("slow");
    expect(getSpeedBand("cloze", 25_000)).toBe("normal");
  });

  it("suggests ratings from correctness and speed", () => {
    expect(
      suggestRating({
        isCorrect: false,
        attempts: 1,
        mode: "typing",
        elapsedMilliseconds: 5_000
      })
    ).toBe("forgot");
    expect(
      suggestRating({
        isCorrect: true,
        attempts: 1,
        mode: "choice",
        elapsedMilliseconds: 3_000
      })
    ).toBe("easy");
  });

  it("advances a correct normal answer with good rating", () => {
    const result = calculateSchedule({
      card: { level: 3 },
      performance: {
        isCorrect: true,
        attempts: 1,
        mode: "typing",
        elapsedMilliseconds: 12_000
      },
      userRating: "good",
      now
    });
    expect(result.levelAfter).toBe(4);
    expect(result.nextReviewAt).toBeGreaterThan(now);
  });

  it("lets a slow correct answer hold its level", () => {
    const result = calculateSchedule({
      card: { level: 3 },
      performance: {
        isCorrect: true,
        attempts: 1,
        mode: "cloze",
        elapsedMilliseconds: 31_000
      },
      userRating: "hard",
      now
    });
    expect(result.levelAfter).toBe(3);
  });

  it("resets a wrong answer", () => {
    const result = calculateSchedule({
      card: { level: 5 },
      performance: {
        isCorrect: false,
        attempts: 1,
        mode: "choice",
        elapsedMilliseconds: 3_000
      },
      userRating: "hard",
      now
    });
    expect(result.levelAfter).toBe(0);
  });
});
