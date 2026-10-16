const translationCache = new Map();

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

const LANGUAGE_PAIRS = {
  en: "en|zh-CN",
  fr: "fr|zh-CN"
};

function sourceLanguage(value) {
  return value === "fr" ? "fr" : "en";
}

async function requestMyMemory(text, language) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", LANGUAGE_PAIRS[language]);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "english-memory-local/0.1"
    },
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) {
    throw new Error(`MyMemory ${response.status}`);
  }

  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || typeof translated !== "string") {
    throw new Error("MyMemory returned no translation");
  }

  return translated;
}

async function requestGoogleFallback(text, language) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", language);
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "english-memory-local/0.1"
    },
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) {
    throw new Error(`Google fallback ${response.status}`);
  }

  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map((item) => item?.[0] ?? "").join("")
    : "";

  if (!translated) {
    throw new Error("Google fallback returned no translation");
  }

  return translated;
}

export async function translateLanguage(text, languageInput = "en") {
  const language = sourceLanguage(languageInput);
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("没有可以翻译的内容");
  }
  if (normalized.length > 2_000) {
    throw new Error("单次翻译最多支持 2000 个字符");
  }

  const cacheKey = `${language}:${normalized.toLocaleLowerCase(language)}`;
  if (translationCache.has(cacheKey)) {
    return {
      text: translationCache.get(cacheKey),
      provider: "cache",
      cached: true
    };
  }

  let translated;
  let provider;

  if (language === "fr") {
    try {
      translated = await requestGoogleFallback(normalized, language);
      provider = "Google public endpoint";
    } catch {
      translated = await requestMyMemory(normalized, language);
      provider = "MyMemory";
    }
  } else {
    try {
      translated = await requestMyMemory(normalized, language);
      provider = "MyMemory";
    } catch {
      translated = await requestGoogleFallback(normalized, language);
      provider = "Google public endpoint";
    }
  }

  translationCache.set(cacheKey, translated);
  return { text: translated, provider, cached: false };
}

export async function translateEnglish(text) {
  return translateLanguage(text, "en");
}
