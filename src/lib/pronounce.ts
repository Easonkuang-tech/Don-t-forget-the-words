import type { LanguageCode } from "../types";

export type Accent = "uk" | "us" | "fr";

export const ACCENTS: Accent[] = ["uk", "us"];

export function accentsForLanguage(language: LanguageCode): Accent[] {
  return language === "fr" ? ["fr"] : ACCENTS;
}

export function defaultAccent(language: LanguageCode): Accent {
  return language === "fr" ? "fr" : "us";
}

export const ACCENT_LABEL: Record<Accent, string> = {
  uk: "英",
  us: "美",
  fr: "法"
};

export interface AccentPronunciation {
  phonetic: string;
  audio: string;
}

export interface Pronunciation {
  word: string;
  uk?: AccentPronunciation;
  us?: AccentPronunciation;
  fr?: AccentPronunciation;
}

export interface PronunciationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_PRONUNCIATION: Pronunciation = {
  word: "",
  uk: { phonetic: "", audio: "" },
  us: { phonetic: "", audio: "" },
  fr: { phonetic: "", audio: "" }
};

const CACHE_PREFIX = "reploop:pron:";
const RECORDING_PREFIX = "reploop:pronok:";
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 6 * 60 * 60 * 1_000;
const RECORDING_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const RECORDING_MISS_TTL_MS = 6 * 60 * 60 * 1_000;
const VERIFY_TIMEOUT_MS = 3_000;

export function accentToLang(
  accent: Accent,
  language: LanguageCode = "en"
): string {
  if (accent === "fr" || language === "fr") {
    return "fr-FR";
  }
  return accent === "uk" ? "en-GB" : "en-US";
}

export function isSingleWord(text: string): boolean {
  return /^[\p{L}][\p{L}'’-]*$/u.test(text.trim());
}

export function audioProxyUrl(
  word: string,
  accent: Accent,
  language: LanguageCode = "en"
): string {
  return `/api/pronounce/audio?word=${encodeURIComponent(
    word.trim()
  )}&accent=${accent}&language=${language}`;
}

function cacheKey(word: string, language: LanguageCode): string {
  return `${CACHE_PREFIX}${language}:${word.trim().toLocaleLowerCase(language)}`;
}

function defaultStorage(): PronunciationStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCachedPronunciation(
  word: string,
  language: LanguageCode = "en",
  storage: PronunciationStorage | null = defaultStorage(),
  now = Date.now()
): Pronunciation | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(cacheKey(word, language));
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as {
      at?: number;
      data?: Pronunciation | null;
    };
    const at = Number(entry.at);
    if (!Number.isFinite(at)) {
      return null;
    }
    const ttl = entry.data ? HIT_TTL_MS : MISS_TTL_MS;
    if (now - at > ttl) {
      return null;
    }
    return entry.data ?? null;
  } catch {
    return null;
  }
}

export function writeCachedPronunciation(
  word: string,
  data: Pronunciation | null,
  language: LanguageCode = "en",
  storage: PronunciationStorage | null = defaultStorage(),
  now = Date.now()
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      cacheKey(word, language),
      JSON.stringify({ at: now, data })
    );
  } catch {
    // Storage full or blocked: pronunciation stays uncached, playback still works.
  }
}

export function hasPronunciation(
  value: Pronunciation | null | undefined
): boolean {
  if (!value) {
    return false;
  }
  return Boolean(
    value.uk?.phonetic ||
      value.uk?.audio ||
      value.us?.phonetic ||
      value.us?.audio ||
      value.fr?.phonetic ||
      value.fr?.audio
  );
}

export function readRecordingState(
  word: string,
  accent: Accent,
  language: LanguageCode = "en",
  storage: PronunciationStorage | null = defaultStorage(),
  now = Date.now()
): boolean {
  if (!storage) {
    return false;
  }
  try {
    const raw = storage.getItem(
      `${RECORDING_PREFIX}${language}:${word.trim().toLocaleLowerCase(
        language
      )}:${accent}`
    );
    if (!raw) {
      return false;
    }
    const entry = JSON.parse(raw) as { at?: number; ok?: boolean };
    const at = Number(entry.at);
    if (!Number.isFinite(at)) {
      return false;
    }
    const ttl = entry.ok ? RECORDING_HIT_TTL_MS : RECORDING_MISS_TTL_MS;
    return Boolean(entry.ok) && now - at <= ttl;
  } catch {
    return false;
  }
}

export function writeRecordingState(
  word: string,
  accent: Accent,
  ok: boolean,
  language: LanguageCode = "en",
  storage: PronunciationStorage | null = defaultStorage(),
  now = Date.now()
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      `${RECORDING_PREFIX}${language}:${word.trim().toLocaleLowerCase(
        language
      )}:${accent}`,
      JSON.stringify({ at: now, ok })
    );
  } catch {
    // Verification state is an optimisation only.
  }
}

export async function verifyRecording(
  word: string,
  accent: Accent,
  language: LanguageCode = "en",
  timeoutMs = VERIFY_TIMEOUT_MS
): Promise<boolean> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(audioProxyUrl(word, accent, language), {
      signal: controller.signal
    });
    if (response.body) {
      void response.body.cancel().catch(() => undefined);
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function fetchPronunciation(
  word: string,
  language: LanguageCode = "en",
  signal?: AbortSignal
): Promise<Pronunciation | null> {
  const query = word.trim();
  if (!query) {
    return null;
  }
  try {
    const response = await fetch(
      `/api/pronounce?word=${encodeURIComponent(query)}&language=${language}`,
      { signal }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as Pronunciation;
    return hasPronunciation(data) ? data : null;
  } catch {
    return null;
  }
}

export async function loadPronunciation(
  word: string,
  language: LanguageCode = "en",
  signal?: AbortSignal
): Promise<Pronunciation | null> {
  const cached = readCachedPronunciation(word, language);
  if (cached) {
    return cached;
  }
  if (!isSingleWord(word)) {
    return null;
  }
  const data = await fetchPronunciation(word, language, signal);
  if (!signal?.aborted) {
    writeCachedPronunciation(word, data, language);
  }
  return data;
}

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function stopPronunciation(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeUtterance) {
    try {
      globalThis.speechSynthesis?.cancel();
    } catch {
      // Ignore: cancel is best effort.
    }
    activeUtterance = null;
  }
}

export function isSpeechSupported(): boolean {
  return typeof globalThis.speechSynthesis !== "undefined";
}

function pickVoice(accent: Accent, language: LanguageCode): SpeechSynthesisVoice | null {
  const synth = globalThis.speechSynthesis;
  if (!synth) {
    return null;
  }
  const voices = synth.getVoices?.() ?? [];
  if (!voices.length) {
    return null;
  }
  const lang = accentToLang(accent, language).toLowerCase();
  const exact = voices.filter(
    (voice) => voice.lang?.toLowerCase().replace("_", "-") === lang
  );
  if (exact.length) {
    return exact.find((voice) => voice.localService !== false) ?? exact[0];
  }
  const loose = voices.filter((voice) =>
    voice.lang?.toLowerCase().startsWith(lang.slice(0, 2))
  );
  return loose[0] ?? null;
}

function waitForVoices(): Promise<void> {
  const synth = globalThis.speechSynthesis;
  if (!synth || (synth.getVoices?.() ?? []).length) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener?.("voiceschanged", done);
      resolve();
    };
    synth.addEventListener?.("voiceschanged", done);
    globalThis.setTimeout(done, 1_000);
  });
}

async function speakWithSynth(
  text: string,
  accent: Accent,
  language: LanguageCode
): Promise<void> {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    throw new Error("当前环境不支持语音合成");
  }

  await waitForVoices();

  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accentToLang(accent, language);
    const voice = pickVoice(accent, language);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      resolve();
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      reject(new Error("语音合成失败"));
    };
    activeUtterance = utterance;
    synth.speak(utterance);
  });
}

function playAudioElement(url: string): Promise<void> {
  if (typeof Audio === "undefined") {
    return Promise.reject(new Error("当前环境不支持音频播放"));
  }
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("录音播放失败"));
    activeAudio = audio;
    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch(() => finish(new Error("录音播放失败")));
    }
  });
}

export interface PlayOptions {
  language?: LanguageCode;
  pronunciation?: Pronunciation | null;
}

export async function playPronunciation(
  word: string,
  accent: Accent,
  options: PlayOptions = {}
): Promise<void> {
  const text = word.trim();
  if (!text) {
    return;
  }

  stopPronunciation();
  const language = options.language ?? "en";

  const known =
    options.pronunciation ?? readCachedPronunciation(text, language) ?? null;
  const recordable = Boolean(known) && isSingleWord(text) && Boolean(known?.[accent]?.audio);
  const recorded =
    recordable && readRecordingState(text, accent, language)
      ? audioProxyUrl(text, accent, language)
      : "";

  if (recorded) {
    try {
      await playAudioElement(recorded);
      return;
    } catch {
      // Fall back to speech synthesis below.
    }
  }

  await speakWithSynth(text, accent, language);

  if (!known && isSingleWord(text)) {
    void loadPronunciation(text, language);
  }
  if (recordable && !readRecordingState(text, accent, language)) {
    void verifyRecording(text, accent, language).then((ok) =>
      writeRecordingState(text, accent, ok, language)
    );
  }
}
