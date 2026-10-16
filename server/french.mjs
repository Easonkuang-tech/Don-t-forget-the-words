import { translateLanguage } from "./translation.mjs";

const LOOKUP_BASE = "https://freedictionaryapi.com/api/v1/entries/fr";
const REQUEST_TIMEOUT_MS = 8_000;
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 6 * 60 * 60 * 1_000;

const cache = new Map();

function normalizeWord(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function firstIpa(entry) {
  const list = Array.isArray(entry?.pronunciations) ? entry.pronunciations : [];
  const ipa = list.find(
    (item) => item?.type === "ipa" && typeof item.text === "string"
  );
  return ipa?.text?.trim() ?? "";
}

function definitions(entry) {
  const senses = Array.isArray(entry?.senses) ? entry.senses : [];
  return senses
    .map((sense) => String(sense?.definition ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

async function requestDictionary(word) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${LOOKUP_BASE}/${encodeURIComponent(word)}`, {
      headers: {
        accept: "application/json",
        "User-Agent": "reploop/0.2"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseDictionary(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const first = entries.find(
    (entry) => entry?.language?.code === "fr" || !entry?.language
  );
  if (!first) {
    return null;
  }
  return {
    phonetic: firstIpa(first),
    definition: definitions(first).join("\n"),
    pos: String(first.partOfSpeech ?? "")
  };
}

export async function lookupFrench(input) {
  const word = normalizeWord(input);
  if (!word) {
    return { found: false, query: word, entries: [], suggestions: [] };
  }

  const key = word.toLocaleLowerCase("fr");
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < (cached.data ? HIT_TTL_MS : MISS_TTL_MS)) {
    return cached.data ?? { found: false, query: word, entries: [], suggestions: [] };
  }

  const singleWord = !word.includes(" ");
  const [payload, translation] = await Promise.all([
    singleWord ? requestDictionary(word) : Promise.resolve(null),
    translateLanguage(word, "fr").catch(() => null)
  ]);
  const parsed = payload ? parseDictionary(payload) : null;
  const translated = translation?.text?.trim() ?? "";

  if (!parsed && !translated) {
    const miss = { found: false, query: word, entries: [], suggestions: [] };
    cache.set(key, { at: now, data: null });
    return miss;
  }

  const result = {
    found: true,
    query: word,
    entries: [
      {
        word,
        phonetic: parsed?.phonetic ?? "",
        definition: parsed?.definition ?? "",
        translation: translated || parsed?.definition || "",
        pos: parsed?.pos ?? ""
      }
    ],
    suggestions: []
  };
  cache.set(key, { at: now, data: result });
  return result;
}

export function clearFrenchDictionaryCache() {
  cache.clear();
}
