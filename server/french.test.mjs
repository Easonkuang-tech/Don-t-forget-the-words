import { describe, expect, it } from "vitest";
import { parseDictionary } from "./french.mjs";

const payload = {
  entries: [
    {
      language: { code: "fr", name: "French" },
      partOfSpeech: "noun",
      pronunciations: [
        { type: "ipa", text: "/ʃa/" },
        { type: "ipa", text: "[ʃɔ]", tags: ["Canada"] }
      ],
      senses: [
        { definition: "cat (feline)" },
        { definition: "(male) cat, tom, tomcat" }
      ]
    }
  ]
};

describe("parseDictionary", () => {
  it("extracts the first IPA, part of speech and definitions", () => {
    expect(parseDictionary(payload)).toEqual({
      phonetic: "/ʃa/",
      definition: "cat (feline)\n(male) cat, tom, tomcat",
      pos: "noun"
    });
  });

  it("returns null when no French entry exists", () => {
    expect(parseDictionary({ entries: [] })).toBeNull();
    expect(parseDictionary(null)).toBeNull();
  });
});
