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

const NUMBER_HINTS = [
  ["zero", "zéro", "零", "number 0"],
  ["one", "un", "一", "number 1"],
  ["two", "deux", "二", "number 2"],
  ["three", "trois", "三", "number 3"],
  ["four", "quatre", "四", "number 4"],
  ["five", "cinq", "五", "number 5"],
  ["six", "six", "六", "number 6"],
  ["seven", "sept", "七", "number 7"],
  ["eight", "huit", "八", "number 8"],
  ["nine", "neuf", "九", "number 9"],
  ["ten", "dix", "十", "number 10"],
  ["eleven", "onze", "十一", "number 11"],
  ["twelve", "douze", "十二", "number 12"],
  ["thirteen", "treize", "十三", "number 13"],
  ["fourteen", "quatorze", "十四", "number 14"],
  ["fifteen", "quinze", "十五", "number 15"],
  ["sixteen", "seize", "十六", "number 16"],
  ["seventeen", "dix-sept", "十七", "number 17"],
  ["eighteen", "dix-huit", "十八", "number 18"],
  ["nineteen", "dix-neuf", "十九", "number 19"],
  ["twenty", "vingt", "二十", "number 20"]
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
  const number = NUMBER_HINTS.find(
    ([en, fr]) =>
      normalizeKey(en) === wordKey || normalizeKey(fr) === wordKey
  );
  if (number) {
    return number[3];
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
        /alopecia|disease|medical|surgery|wound|disorder|rhinotracheitis|viral|virus|infection|sick|illness|portrait|woman|man|person|people/.test(
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

async function fetchJson(url, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

export function parseWikipediaSummary(payload, language = "en") {
  if (
    !payload ||
    payload.type === "disambiguation" ||
    (!payload.thumbnail?.source && !payload.originalimage?.source)
  ) {
    return null;
  }
  const imageUrl = payload.originalimage?.source || payload.thumbnail?.source;
  const imageThumbUrl = payload.thumbnail?.source || imageUrl;
  if (!imageUrl || !imageThumbUrl) {
    return null;
  }
  return {
    found: true,
    query: payload.title || "",
    provider: `Wikipedia (${language.toUpperCase()})`,
    imageUrl,
    imageThumbUrl,
    sourceUrl:
      payload.content_urls?.desktop?.page ||
      `https://${language}.wikipedia.org/wiki/${encodeURIComponent(
        payload.title || ""
      )}`,
    attribution: `Wikipedia · ${payload.title || "article"}`
  };
}

async function searchWikipedia(word, language) {
  const url = new URL(
    `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      word
    )}`
  );
  const payload = await fetchJson(
    url,
    { "accept-language": language },
    3_000
  );
  return payload ? parseWikipediaSummary(payload, language) : null;
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

  const result =
    (await searchWikipedia(word, language)) ?? (await searchWikimedia(query));
  const data = result ?? { found: false, query, provider: "" };
  cache.set(key, { at: now, data });
  return data;
}

export function findCardImage(input) {
  const task = queue.then(() => resolveCardImage(input));
  queue = task.catch(() => undefined);
  return task;
}
