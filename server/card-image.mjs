const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
const WIKIMEDIA_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 5_000;
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

const MONTH_HINTS = [
  { keys: ["janvier", "january", "一月"], query: "January winter" },
  { keys: ["février", "fevrier", "february", "二月"], query: "February winter" },
  { keys: ["mars", "march", "三月"], query: "March spring bloom" },
  { keys: ["avril", "april", "四月"], query: "April spring flowers" },
  { keys: ["mai", "may", "五月"], query: "May spring flowers" },
  { keys: ["juin", "june", "六月"], query: "June summer sunlight" },
  { keys: ["juillet", "july", "七月"], query: "July summer vacation" },
  { keys: ["août", "aout", "august", "八月"], query: "August summer holiday" },
  { keys: ["septembre", "september", "九月"], query: "September autumn harvest" },
  { keys: ["octobre", "october", "十月"], query: "October autumn leaves" },
  { keys: ["novembre", "november", "十一月"], query: "November autumn fog" },
  { keys: ["décembre", "decembre", "december", "十二月"], query: "December winter snow" }
];

const cache = new Map();
let queue = Promise.resolve();

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

function words(value) {
  return normalizeText(value)
    .replace(/[()]/g, " ")
    .match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
}

export function buildImageQuery({ word, meaning, definition, language }) {
  const safeWord = normalizeText(word);
  const wordKey = normalizeKey(safeWord);
  const meaningText = normalizeText(meaning);
  const month = MONTH_HINTS.find(
    (hint) =>
      hint.keys.some((key) => normalizeKey(key) === wordKey) ||
      hint.keys.some((key) => /^[\u4e00-\u9fff]+$/.test(key) && meaningText.includes(key))
  );
  if (month) {
    return month.query;
  }
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
  const terms = normalizeKey(query).split(/\s+/).filter(Boolean);
  const personQuery = terms.some((term) =>
    ["person", "people", "woman", "man", "portrait", "girl", "boy"].includes(term)
  );

  function score(item) {
    const text = normalizeKey(
      [
        item?.title,
        ...(Array.isArray(item?.tags) ? item.tags.map((tag) => tag?.name) : [])
      ].join(" ")
    );
    let value = terms.reduce(
      (total, term) => total + (text.includes(term) ? 2 : 0),
      0
    );
    if (
      !personQuery &&
      /portrait|woman|man|people|person|girl|boy/.test(text)
    ) {
      value -= 5;
    }
    return value;
  }

  const result = results
    .filter(
      (item) =>
        item &&
        item.mature !== true &&
        typeof item.url === "string" &&
        item.url &&
        typeof item.thumbnail === "string" &&
        item.thumbnail
    )
    .sort((left, right) => score(right) - score(left))[0];
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
  const terms = normalizeKey(query).split(/\s+/).filter(Boolean);
  const candidate = candidates
    .map((entry) => {
      const text = normalizeKey(
        [
          entry.page?.title,
          stripHtml(entry.info.extmetadata?.ImageDescription?.value)
        ].join(" ")
      );
      const matches = terms.reduce(
        (total, term) => total + (text.includes(term) ? 2 : 0),
        0
      );
      const medicalPenalty =
        !terms.some((term) => ["medical", "disease"].includes(term)) &&
        /alopecia|disease|medical|surgery|wound|disorder|portrait|woman|man|person|people/.test(
          text
        )
          ? 5
          : 0;
      return { entry, score: matches - medicalPenalty };
    })
    .sort((left, right) => right.score - left.score)[0]?.entry;
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
  url.searchParams.set("page_size", "4");
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
  url.searchParams.set("gsrlimit", "4");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "960");
  url.searchParams.set("format", "json");
  const payload = await fetchJson(url);
  return payload ? parseWikimedia(payload, query) : null;
}

async function searchWithFallback(query) {
  const openverse = searchOpenverse(query).catch(() => null);
  const wikimedia = searchWikimedia(query).catch(() => null);
  const openverseWindow = new Promise((resolve) =>
    setTimeout(() => resolve(null), 2_500)
  );
  const preferred = await Promise.race([openverse, openverseWindow]);
  if (preferred) {
    return preferred;
  }
  return (await wikimedia) ?? (await openverse);
}

async function resolveCardImage(input) {
  const word = normalizeText(input?.word);
  if (!word) {
    return { found: false, query: "", provider: "" };
  }
  const language = input?.language === "fr" ? "fr" : "en";
  const meaning = normalizeText(input?.meaning);
  const definition = normalizeText(input?.definition);
  const query = buildImageQuery({ word, meaning, definition, language });
  const key = `${language}:${word.toLocaleLowerCase(language)}:${definition}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < (cached.data?.found ? HIT_TTL_MS : MISS_TTL_MS)) {
    return cached.data;
  }

  const result = await searchWithFallback(query);
  const data = result ?? { found: false, query, provider: "" };
  cache.set(key, { at: now, data });
  return data;
}

export function findCardImage(input) {
  const task = queue.then(() => resolveCardImage(input));
  queue = task.catch(() => undefined);
  return task;
}
