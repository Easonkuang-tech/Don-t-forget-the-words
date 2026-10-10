import { describe, expect, it } from "vitest";
import { parsePronunciation } from "./pronounce.mjs";

const payload = [
  {
    word: "water",
    phonetics: [
      { text: "/ˈwɔːtə/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-uk.mp3" },
      { text: "/ˈwɔtɚ/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-us.mp3" },
      { text: "/ˈwɔːtə/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-au.mp3" }
    ]
  }
];

describe("parsePronunciation", () => {
  it("separates uk and us audio, ignoring other accents", () => {
    const result = parsePronunciation(payload);
    expect(result.uk.audio).toContain("water-uk.mp3");
    expect(result.us.audio).toContain("water-us.mp3");
    expect(result.us.audio).not.toContain("-au");
    expect(result.uk.phonetic).toBe("/ˈwɔːtə/");
    expect(result.us.phonetic).toBe("/ˈwɔtɚ/");
  });

  it("keeps text-only phonetics when no labelled audio exists", () => {
    const result = parsePronunciation([
      { phonetics: [{ text: "/sɪˈmestə/" }, { text: "/sɪˈmestɚ/" }] }
    ]);
    expect(result.uk.phonetic).toBe("/sɪˈmestə/");
    expect(result.us.phonetic).toBe("/sɪˈmestɚ/");
    expect(result.uk.audio).toBe("");
    expect(result.us.audio).toBe("");
  });

  it("upgrades protocol-relative audio urls", () => {
    const result = parsePronunciation([
      { phonetics: [{ audio: "//cdn.example.test/word-uk.mp3" }] }
    ]);
    expect(result.uk.audio).toBe("https://cdn.example.test/word-uk.mp3");
  });

  it("survives malformed payloads", () => {
    expect(parsePronunciation(null).uk.audio).toBe("");
    expect(parsePronunciation([{ phonetics: null }]).us.phonetic).toBe("");
    expect(parsePronunciation([null, "x"]).uk.phonetic).toBe("");
  });
});
