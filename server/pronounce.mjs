const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";
const REQUEST_TIMEOUT_MS = 6_000;
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 6 * 60 * 60 * 1_000;

const cache = new Map();

function normalizeAudioUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) {
    return "";
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return url;
}

function classifyAudio(url) {
  const lower = url.toLowerCase();
  if (lower.includes("-uk.") || lower.includes("-gb.") || lower.includes("_uk.")) {
    return "uk";
  }
  if (lower.includes("-us.") || lower.includes("_us.")) {
    return "us";
  }
  return "";
}

function collectPhonetics(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }
  const items = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const list = Array.isArray(entry.phonetics) ? entry.phonetics : [];
    for (const item of list) {
      if (!item || typeof item !== "object") {
        continue;
      }
      items.push({
        text: String(item.text ?? "").trim(),
        audio: normalizeAudioUrl(item.audio)
      });
    }
  }
  return items;
}

export function parsePronunciation(payload) {
  const items = collectPhonetics(payload);
  const result = {
    uk: { phonetic: "", audio: "" },
    us: { phonetic: "", audio: "" }
  };
  const loneTexts = [];

  for (const item of items) {
    const accent = classifyAudio(item.audio);
    if (!accent) {
      if (item.text) {
        loneTexts.push(item.text);
      }
      continue;
    }
    if (!result[accent].audio && item.audio) {
      result[accent].audio = item.audio;
    }
    if (!result[accent].phonetic && item.text) {
      result[accent].phonetic = item.text;
    }
  }

  if (loneTexts.length) {
    const first = loneTexts[0];
    if (!result.uk.phonetic) {
      result.uk.phonetic = first;
    }
    if (!result.us.phonetic && loneTexts[1]) {
      result.us.phonetic = loneTexts[1];
    }
  }

  return result;
}

async function requestPronunciation(word) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(word)}`,
      { signal: controller.signal, headers: { accept: "application/json" } }
    );
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

export async function resolvePronunciation(input) {
  const word = String(input ?? "").trim();
  if (!word || word.includes(" ")) {
    return { word, uk: { phonetic: "", audio: "" }, us: { phonetic: "", audio: "" } };
  }

  const key = word.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.data ? HIT_TTL_MS : MISS_TTL_MS)) {
    return hit.data ?? { word, uk: { phonetic: "", audio: "" }, us: { phonetic: "", audio: "" } };
  }

  const payload = await requestPronunciation(word);
  const parsed = payload ? parsePronunciation(payload) : null;
  const data =
    parsed && (parsed.uk.audio || parsed.us.audio || parsed.uk.phonetic || parsed.us.phonetic)
      ? { word, ...parsed }
      : null;

  cache.set(key, { at: now, data });
  return data ?? { word, uk: { phonetic: "", audio: "" }, us: { phonetic: "", audio: "" } };
}

export function clearPronunciationCache() {
  cache.clear();
}
