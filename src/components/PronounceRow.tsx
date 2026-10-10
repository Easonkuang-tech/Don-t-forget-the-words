import { useEffect, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import {
  ACCENTS,
  ACCENT_LABEL,
  isSingleWord,
  loadPronunciation,
  playPronunciation,
  readCachedPronunciation,
  verifyRecording,
  writeRecordingState,
  stopPronunciation,
  type Accent,
  type Pronunciation
} from "../lib/pronounce";

interface PronounceRowProps {
  word: string;
  fallbackPhonetic?: string;
  showPhonetic?: boolean;
  compact?: boolean;
  className?: string;
}

function formatPhonetic(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "";
}

export function PronounceRow({
  word,
  fallbackPhonetic = "",
  showPhonetic = true,
  compact = false,
  className = ""
}: PronounceRowProps) {
  const [info, setInfo] = useState<Pronunciation | null>(() =>
    readCachedPronunciation(word)
  );
  const [playing, setPlaying] = useState<Accent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(null);
    setFailed(false);
    const controller = new AbortController();

    const verifyRecordings = (data: Pronunciation | null) => {
      if (!data) {
        return;
      }
      for (const accent of ACCENTS) {
        if (!data[accent]?.audio) {
          continue;
        }
        void verifyRecording(word, accent).then((ok) =>
          writeRecordingState(word, accent, ok)
        );
      }
    };

    const cached = readCachedPronunciation(word);
    setInfo(cached);
    verifyRecordings(cached);

    if (!cached && isSingleWord(word)) {
      void loadPronunciation(word, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setInfo(data);
            verifyRecordings(data);
          }
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [word]);

  async function toggle(accent: Accent) {
    if (playing === accent) {
      stopPronunciation();
      setPlaying(null);
      return;
    }
    setFailed(false);
    setPlaying(accent);
    try {
      await playPronunciation(word, accent, { pronunciation: info });
    } catch {
      setFailed(true);
    } finally {
      setPlaying(null);
    }
  }

  return (
    <div
      className={`pronounce-row${compact ? " is-compact" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {ACCENTS.map((accent) => {
        const phonetic =
          info?.[accent]?.phonetic ||
          (accent === "uk" ? fallbackPhonetic : "");
        const label = formatPhonetic(phonetic);
        const isPlaying = playing === accent;
        return (
          <button
            type="button"
            key={accent}
            className={`pronounce-btn${isPlaying ? " is-playing" : ""}`}
            onClick={() => void toggle(accent)}
            aria-label={`播放${ACCENT_LABEL[accent]}式发音`}
            title={`播放${ACCENT_LABEL[accent]}式发音`}
          >
            <span className="pronounce-accent">{ACCENT_LABEL[accent]}</span>
            {showPhonetic && label ? (
              <span className="pronounce-phonetic">{label}</span>
            ) : null}
            {isPlaying ? (
              <LoaderCircle className="pronounce-icon is-spinning" size={14} />
            ) : (
              <Volume2 className="pronounce-icon" size={14} />
            )}
          </button>
        );
      })}
      {failed ? (
        <span className="pronounce-error" role="status">
          发音暂不可用
        </span>
      ) : null}
    </div>
  );
}
