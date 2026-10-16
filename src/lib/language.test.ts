import { describe, expect, it } from "vitest";
import {
  deckLanguage,
  isLanguageCode,
  languageLabel,
  languageName,
  resolveLanguage,
  speechLanguage
} from "./language";

describe("language helpers", () => {
  it("resolves missing legacy deck values to English", () => {
    expect(resolveLanguage(undefined)).toBe("en");
    expect(deckLanguage({})).toBe("en");
    expect(deckLanguage({ language: "fr" })).toBe("fr");
  });

  it("recognises supported language codes", () => {
    expect(isLanguageCode("en")).toBe(true);
    expect(isLanguageCode("fr")).toBe(true);
    expect(isLanguageCode("de")).toBe(false);
  });

  it("labels languages for the UI and speech engine", () => {
    expect(languageLabel("fr")).toBe("法语");
    expect(languageName("fr")).toBe("Français");
    expect(speechLanguage("fr")).toBe("fr-FR");
    expect(speechLanguage("en")).toBe("en-US");
  });
});
