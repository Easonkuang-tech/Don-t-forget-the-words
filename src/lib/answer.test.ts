import { describe, expect, it } from "vitest";
import { matchChineseAnswer, matchEnglishAnswer } from "./answer";

describe("matchEnglishAnswer", () => {
  it("ignores case, punctuation and repeated spaces", () => {
    expect(matchEnglishAnswer("  Make   the right CALL! ", "make the right call")).toBe(
      true
    );
  });

  it("accepts a single spelling mistake in longer answers", () => {
    expect(matchEnglishAnswer("corperate", "corporate")).toBe(true);
  });

  it("rejects unrelated answers", () => {
    expect(matchEnglishAnswer("balance", "corporate")).toBe(false);
  });
});

describe("matchChineseAnswer", () => {
  it("accepts one of several slash-separated meanings", () => {
    expect(
      matchChineseAnswer("做出正确判断", "做出正确判断 / 关键时刻的正确决定")
    ).toBe(true);
  });

  it("ignores common Chinese punctuation and spaces", () => {
    expect(matchChineseAnswer("偶然遇见", "偶然遇见；无意中发现")).toBe(true);
  });

  it("rejects unrelated Chinese answers", () => {
    expect(matchChineseAnswer("给顾客结账", "偶然遇见")).toBe(false);
  });
});
