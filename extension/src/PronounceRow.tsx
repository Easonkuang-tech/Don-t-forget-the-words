import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { REPLOOP_ORIGIN } from "./supabase";

type Accent = "uk" | "us";

interface AccentInfo {
  phonetic: string;
  audio: string;
}

interface Pronunciation {
  uk: AccentInfo;
  us: AccentInfo;
}

const ACCENTS: { key: Accent; label: string; lang: string }[] = [
  { key: "uk", label: "英", lang: "en-GB" },
  { key: "us", label: "美", lang: "en-US" }
];

const cache = new Map<string, Pronunciation | null>();
const verified = new Map<string, boolean>();

const VERIFY_TIMEOUT_MS = 3_000;

function recordingKey(word: string, accent: Accent): string {
  return `${word.trim().toLowerCase()}:${accent}`;
}

async function verifyRecording(word: string, accent: Accent): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${REPLOOP_ORIGIN}/api/pronounce/audio?word=${encodeURIComponent(
        word.trim()
      )}&accent=${accent}`,
      { signal: controller.signal }
    );
    if (response.body) {
      void response.body.cancel().catch(() => undefined);
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function refreshVerification(word: string, info: Pronunciation | null): void {
  if (!info || !isSingleWord(word)) {
    return;
  }
  for (const item of ACCENTS) {
    if (info[item.key]?.audio) {
      void verifyRecording(word, item.key).then((ok) => {
        verified.set(recordingKey(word, item.key), ok);
      });
    }
  }
}

function formatPhonetic(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "";
}

function isSingleWord(text: string): boolean {
  return /^[A-Za-z][A-Za-z'’-]*$/.test(text.trim());
}

async function resolve(word: string): Promise<Pronunciation | null> {
  const key = word.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (!isSingleWord(word)) {
    cache.set(key, null);
    return null;
  }
  try {
    const response = await fetch(
      `${REPLOOP_ORIGIN}/api/pronounce?word=${encodeURIComponent(word.trim())}`
    );
    if (!response.ok) {
      throw new Error("resolve failed");
    }
    const data = (await response.json()) as Pronunciation;
    const usable =
      data && (data.uk?.audio || data.us?.audio || data.uk?.phonetic || data.us?.phonetic)
        ? data
        : null;
    cache.set(key, usable);
    return usable;
  } catch {
    cache.set(key, null);
    return null;
  }
}

function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (typeof speechSynthesis === "undefined") {
      reject(new Error("no speech synthesis"));
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    const voice = speechSynthesis
      .getVoices()
      .find(
        (item) =>
          item.lang?.toLowerCase().replace("_", "-") === lang.toLowerCase()
      );
    if (voice) {
      utterance.voice = voice;
    }
    utterance.onend = () => resolvePromise();
    utterance.onerror = () => reject(new Error("speech failed"));
    speechSynthesis.speak(utterance);
  });
}

function playAudio(url: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolvePromise();
    audio.onerror = () => reject(new Error("audio failed"));
    void audio.play().catch(() => reject(new Error("audio failed")));
  });
}

interface PronounceRowProps {
  word: string;
  phonetic?: string;
}

export function PronounceRow({ word, phonetic = "" }: PronounceRowProps) {
  const [info, setInfo] = useState<Pronunciation | null>(null);
  const [playing, setPlaying] = useState<Accent | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setPlaying(null);
    void resolve(word).then((data) => {
      if (!cancelled) {
        setInfo(data);
        refreshVerification(word, data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  async function play(accent: Accent, lang: string) {
    if (playing === accent) {
      speechSynthesis?.cancel();
      setPlaying(null);
      return;
    }
    setPlaying(accent);
    try {
      const recorded = info?.[accent]?.audio;
      const usable =
        Boolean(recorded) &&
        isSingleWord(word) &&
        verified.get(recordingKey(word, accent)) === true;
      if (usable) {
        await playAudio(
          `${REPLOOP_ORIGIN}/api/pronounce/audio?word=${encodeURIComponent(
            word.trim()
          )}&accent=${accent}`
        );
      } else {
        await speak(word.trim(), lang);
        if (recorded && isSingleWord(word)) {
          void verifyRecording(word, accent).then((ok) => {
            verified.set(recordingKey(word, accent), ok);
          });
        }
      }
    } catch {
      // Playback problems must never block lookup.
    } finally {
      setPlaying(null);
    }
  }

  return (
    <div className="pronounce-row">
      {ACCENTS.map((item) => {
        const label = formatPhonetic(
          info?.[item.key]?.phonetic || (item.key === "uk" ? phonetic : "")
        );
        return (
          <button
            type="button"
            key={item.key}
            className={playing === item.key ? "is-playing" : ""}
            onClick={() => void play(item.key, item.lang)}
            aria-label={`播放${item.label}式发音`}
            title={`播放${item.label}式发音`}
          >
            <span className="pronounce-accent">{item.label}</span>
            {label ? <span className="pronounce-phonetic">{label}</span> : null}
            <Volume2 size={13} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
