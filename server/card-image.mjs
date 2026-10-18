const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
const WIKIMEDIA_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 12_000;
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 60 * 60 * 1_000;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with",
  "une", "un", "des", "les", "le", "la", "du", "de", "et", "ou", "pour",
  "dans", "sur", "avec", "est", "sont", "ce", "cette"
]);

const ORDINALS = new Set([
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "premier", "première"
]);

const cache = new Map();
let queue = Promise.resolve();

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function words(value) {
  return normalizeText(value)
    .replace(/[()]/g, " ")
    .match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
}

export function buildImageQuery({ word, definition, language }) {
  const safeWord = normalizeText(word);
  if (language !== "fr") {
    return safeWord;
  }

  const seen = new Set();
  const keywords = [];
  for (const token of words(definition)) {
    const normalized = token.toLocaleLowerCase("fr");
    if (
      token.length < 3 ||
      STOPWORDS.has(normalized) ||
      ORDINALS.has(normalized) ||
      /^\d+$/.test(token)
    ) {
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      keywords.push(token);
    }
    if (keywords.length === 2) {
      break;
    }
  }

  return keywords.length ? keywords.join(" ") : safeWord;
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOpenverse(payload, query) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const result = results.find(
    (item) =>
      item &&
      item.mature !== true &&
      typeof item.url === "string" &&
      item.url &&
      typeof item.thumbnail === "string" &&
      item.thumbnail
  );
  if (!result) {
    return null;
  }
  return {
    found: true,
    query,
    provider: "Openverse",
    imageUrl: result.url,
    imageThumbUrl: result.thumbnail,
    sourceUrl: result.foreign_landing_url ?? result.detail_url ?? "",
    attribution: stripHtml(result.attribution)
  };
}

export function parseWikimedia(payload, query) {
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== "object") {
    return null;
  }
  const candidates = Object.values(pages)
    .map((page) => ({
      page,
      info: Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null
    }))
    .filter(({ info }) =>
      info &&
      typeof info.thumburl === "string" &&
      ["image/jpeg", "image/png", "image/webp"].includes(info.mime)
    );
  const candidate = candidates[0];
  if (!candidate) {
    return null;
  }
  const artist = stripHtml(candidate.info.extmetadata?.Artist?.value);
  const license = stripHtml(
    candidate.info.extmetadata?.LicenseShortName?.value
  );
  return {
    found: true,
    query,
    provider: "Wikimedia Commons",
    imageUrl: candidate.info.thumburl,
    imageThumbUrl: candidate.info.thumburl,
    sourceUrl:
      candidate.info.descriptionurl ??
      candidate.info.descriptionshorturl ??
      "",
    attribution: [artist, license].filter(Boolean).join(" · ")
  };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "User-Agent": "RepLoop/0.2 (vocabulary card image search)",
        ...headers
      }
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

async function searchOpenverse(query) {
  const url = new URL(OPENVERSE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "6");
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("mature", "false");
  const payload = await fetchJson(url);
  return payload ? parseOpenverse(payload, query) : null;
}

async function searchWikimedia(query) {
  const url = new URL(WIKIMEDIA_ENDPOINT);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "960");
  url.searchParams.set("format", "json");
  const payload = await fetchJson(url);
  return payload ? parseWikimedia(payload, query) : null;
}

async function resolveCardImage(input) {
  const word = normalizeText(input?.word);
  if (!word) {
    return { found: false, query: "", provider: "" };
  }
  const language = input?.language === "fr" ? "fr" : "en";
  const definition = normalizeText(input?.definition);
  const query = buildImageQuery({ word, definition, language });
  const key = `${language}:${word.toLocaleLowerCase(language)}:${definition}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < (cached.data?.found ? HIT_TTL_MS : MISS_TTL_MS)) {
    return cached.data;
  }

  const result = (await searchOpenverse(query)) ?? (await searchWikimedia(query));
  const data = result ?? { found: false, query, provider: "" };
  cache.set(key, { at: now, data });
  return data;
}

export function findCardImage(input) {
  const task = queue.then(() => resolveCardImage(input));
  queue = task.catch(() => undefined);
  return task;
}
