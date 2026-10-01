const translationCache = new Map();

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function requestMyMemory(text) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "en|zh-CN");

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

async function requestGoogleFallback(text) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
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

export async function translateEnglish(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("没有可以翻译的内容");
  }
  if (normalized.length > 2_000) {
    throw new Error("单次翻译最多支持 2000 个字符");
  }

  const cacheKey = normalized.toLocaleLowerCase("en");
  if (translationCache.has(cacheKey)) {
    return {
      text: translationCache.get(cacheKey),
      provider: "cache",
      cached: true
    };
  }

  let translated;
  let provider;

  try {
    translated = await requestMyMemory(normalized);
    provider = "MyMemory";
  } catch {
    translated = await requestGoogleFallback(normalized);
    provider = "Google public endpoint";
  }

  translationCache.set(cacheKey, translated);
  return { text: translated, provider, cached: false };
}
