import { describe, expect, it } from "vitest";
import {
  accentToLang,
  audioProxyUrl,
  hasPronunciation,
  isSingleWord,
  readCachedPronunciation,
  readRecordingState,
  writeCachedPronunciation,
  writeRecordingState,
  type Pronunciation,
  type PronunciationStorage
} from "./pronounce";

function memoryStorage(): PronunciationStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
}

const sample: Pronunciation = {
  word: "semester",
  uk: { phonetic: "/sɪˈmestə(r)/", audio: "https://example.test/semester-uk.mp3" },
  us: { phonetic: "/sɪˈmestər/", audio: "" }
};

describe("accentToLang", () => {
  it("maps uk and us to their language tags", () => {
    expect(accentToLang("uk")).toBe("en-GB");
    expect(accentToLang("us")).toBe("en-US");
  });
});

describe("isSingleWord", () => {
  it("accepts single words and rejects phrases", () => {
    expect(isSingleWord("semester")).toBe(true);
    expect(isSingleWord("  partner's ")).toBe(true);
    expect(isSingleWord("give up")).toBe(false);
    expect(isSingleWord("This is a sentence.")).toBe(false);
  });
});

describe("audioProxyUrl", () => {
  it("builds an encoded proxy path", () => {
    expect(audioProxyUrl("ice cream", "us")).toBe(
      "/api/pronounce/audio?word=ice%20cream&accent=us"
    );
  });
});

describe("pronunciation cache", () => {
  it("round-trips a hit", () => {
    const storage = memoryStorage();
    writeCachedPronunciation("Semester", sample, storage, 1_000);
    expect(readCachedPronunciation("semester", storage, 2_000)).toEqual(sample);
  });

  it("expires hits after a week and misses after six hours", () => {
    const storage = memoryStorage();
    writeCachedPronunciation("semester", sample, storage, 0);
    writeCachedPronunciation("unknown", null, storage, 0);

    expect(readCachedPronunciation("semester", storage, 8 * 24 * 3_600_000)).toBeNull();
    expect(readCachedPronunciation("unknown", storage, 7 * 3_600_000)).toBeNull();
    expect(readCachedPronunciation("unknown", storage, 1_000)).toBeNull();
    expect(readCachedPronunciation("semester", storage, 1_000)).toEqual(sample);
  });

  it("returns null without storage or on malformed data", () => {
    const storage = memoryStorage();
    storage.setItem("reploop:pron:broken", "{not json");
    expect(readCachedPronunciation("broken", storage, 1_000)).toBeNull();
    expect(readCachedPronunciation("semester", null, 1_000)).toBeNull();
  });
});

describe("hasPronunciation", () => {
  it("requires at least one phonetic or audio field", () => {
    expect(hasPronunciation(sample)).toBe(true);
    expect(
      hasPronunciation({
        word: "unknown",
        uk: { phonetic: "", audio: "" },
        us: { phonetic: "", audio: "" }
      })
    ).toBe(false);
    expect(hasPronunciation(null)).toBe(false);
  });
});

describe("recording verification state", () => {
  it("only reports usable when a recording was verified", () => {
    const storage = memoryStorage();
    writeRecordingState("water", "uk", true, storage, 0);
    writeRecordingState("water", "us", false, storage, 0);

    expect(readRecordingState("water", "uk", storage, 1_000)).toBe(true);
    expect(readRecordingState("water", "us", storage, 1_000)).toBe(false);
    expect(readRecordingState("water", "us", storage, 1_000)).toBe(false);
  });

  it("expires failures sooner than successes", () => {
    const storage = memoryStorage();
    writeRecordingState("water", "uk", true, storage, 0);
    writeRecordingState("water", "us", false, storage, 0);

    expect(readRecordingState("water", "uk", storage, 8 * 24 * 3_600_000)).toBe(true);
    expect(readRecordingState("water", "us", storage, 7 * 3_600_000)).toBe(false);
    expect(readRecordingState("water", "uk", storage, 40 * 24 * 3_600_000)).toBe(false);
  });

  it("defaults to unusable without storage", () => {
    expect(readRecordingState("water", "uk", null, 1_000)).toBe(false);
  });
});
