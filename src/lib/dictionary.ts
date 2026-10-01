import type {
  ContentType,
  DictionaryEntry,
  DictionaryLookupResult
} from "../types";

const PUBLIC_TRANSLATION_ENDPOINT =
  "https://api.mymemory.translated.net/get";

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let message = `接口请求失败 (${response.status})`;
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { error?: string };
      message = data.error || message;
    }
    throw new Error(message);
  }
  if (!contentType.includes("application/json")) {
    throw new Error("接口返回了非 JSON 内容");
  }
  return response.json();
}

async function translateWithPublicService(text: string): Promise<string> {
  const url = new URL(PUBLIC_TRANSLATION_ENDPOINT);
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "en|zh-CN");

  const response = await fetchWithTimeout(url);
  const data = (await readJsonResponse(response)) as {
    responseData?: { translatedText?: string };
    responseDetails?: string;
  };
  const translated = data.responseData?.translatedText;
  if (!translated) {
    throw new Error(data.responseDetails || "备用翻译服务返回空结果");
  }
  return translated;
}

export function detectContentType(value: string): ContentType {
  const trimmed = value.trim();
  if (/[.!?。！？]$/.test(trimmed) || trimmed.split(/\s+/).length >= 7) {
    return "sentence";
  }
  if (trimmed.includes(" ")) {
    return "phrase";
  }
  return "word";
}

export function firstMeaning(entry: DictionaryEntry): string {
  return (
    entry.translation
      ?.split("\n")
      .map((item) => item.trim())
      .find(Boolean) ??
    entry.definition
      ?.split("\n")
      .map((item) => item.trim())
      .find(Boolean) ??
    ""
  );
}

export async function lookupDictionary(
  word: string
): Promise<DictionaryLookupResult> {
  const normalized = word.trim();
  try {
    const response = await fetchWithTimeout(
      `/api/dictionary?word=${encodeURIComponent(normalized)}`
    );
    const result = (await readJsonResponse(
      response
    )) as DictionaryLookupResult;
    if (result.found || normalized.includes(" ")) {
      return result;
    }
  } catch {
    // A static-only deployment may not provide the local Node API.
  }

  if (!normalized.includes(" ")) {
    try {
      const translation = await translateWithPublicService(normalized);
      return {
        found: true,
        query: normalized,
        entries: [
          {
            word: normalized,
            phonetic: "",
            definition: "",
            translation,
            pos: ""
          }
        ],
        suggestions: []
      };
    } catch {
      return {
        found: false,
        query: normalized,
        entries: [],
        suggestions: []
      };
    }
  }

  return {
    found: false,
    query: normalized,
    entries: [],
    suggestions: []
  };
}

export async function translateText(text: string): Promise<string> {
  const normalized = text.trim();
  try {
    const response = await fetchWithTimeout("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: normalized })
    });
    const data = (await readJsonResponse(response)) as { text?: string };
    if (data.text) {
      return data.text;
    }
  } catch {
    // Fall through to a CORS-enabled public translation service.
  }

  try {
    return await translateWithPublicService(normalized);
  } catch {
    throw new Error("在线翻译暂时不可用，请稍后重试或手动填写中文");
  }
}
