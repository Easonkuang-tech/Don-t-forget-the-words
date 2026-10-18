import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  X
} from "lucide-react";
import {
  cardImageFields,
  findCardImage,
  type CardImage as CardImageResult
} from "../lib/cardImage";
import type { LanguageCode } from "../types";

interface CardImageProps {
  word: string;
  meaning?: string;
  definition?: string;
  language: LanguageCode;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageAttribution?: string;
  imageSourceUrl?: string;
  autoLoad?: boolean;
  onResolved?: (
    image: ReturnType<typeof cardImageFields>
  ) => void | Promise<void>;
  className?: string;
}

export function CardImage({
  word,
  meaning = "",
  definition = "",
  language,
  imageUrl = "",
  imageThumbUrl = "",
  imageAttribution = "",
  imageSourceUrl = "",
  autoLoad = false,
  onResolved,
  className = ""
}: CardImageProps) {
  const [result, setResult] = useState<CardImageResult | null>(
    imageUrl
      ? {
          found: true,
          query: "",
          provider: "",
          imageUrl,
          imageThumbUrl: imageThumbUrl || imageUrl,
          sourceUrl: imageSourceUrl,
          attribution: imageAttribution
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setResult(
      imageUrl
        ? {
            found: true,
            query: "",
            provider: "",
            imageUrl,
            imageThumbUrl: imageThumbUrl || imageUrl,
            sourceUrl: imageSourceUrl,
            attribution: imageAttribution
          }
        : null
    );
    setFailed(false);
    setExpanded(false);
  }, [imageAttribution, imageSourceUrl, imageThumbUrl, imageUrl, word]);

  async function load() {
    if (loading) {
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const next = await findCardImage(
        { word, meaning, definition, language },
        controller.signal
      );
      if (controller.signal.aborted) {
        return;
      }
      if (!next.found) {
        setFailed(true);
        return;
      }
      setResult(next);
      await onResolved?.(cardImageFields(next));
    } catch {
      if (!controller.signal.aborted) {
        setFailed(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (autoLoad && !result && !loading && !failed) {
      void load();
    }
    return () => requestRef.current?.abort();
    // load intentionally follows word/language/autoLoad state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, language, word]);

  if (loading) {
    return (
      <div className={`card-image-shell is-loading ${className}`}>
        <LoaderCircle className="spin" size={22} />
        <span>正在寻找配图…</span>
      </div>
    );
  }

  if (failed || !result) {
    return (
      <div className={`card-image-shell is-empty ${className}`}>
        <ImageIcon size={22} />
        <span>{failed ? "配图加载失败" : "还没有配图"}</span>
        <button
          type="button"
          className="card-image-retry"
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          点击重试
        </button>
      </div>
    );
  }

  return (
    <>
      <figure className={`card-image-figure ${className}`}>
        <button
          type="button"
          className="card-image-preview"
          onClick={() => setExpanded(true)}
          aria-label="放大配图"
        >
          <img
            src={result.imageThumbUrl || result.imageUrl}
            alt={`${word} 的语境配图`}
            loading="lazy"
          />
        </button>
        {result.attribution ? (
          <figcaption>
            <span>{result.attribution}</span>
            {result.sourceUrl ? (
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="查看图片来源"
              >
                <ExternalLink size={12} />
              </a>
            ) : null}
          </figcaption>
        ) : null}
      </figure>

      {expanded ? (
        <div
          className="card-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${word} 的配图`}
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            className="card-image-close"
            onClick={() => setExpanded(false)}
            aria-label="关闭配图"
          >
            <X size={20} />
          </button>
          <img
            src={result.imageUrl || result.imageThumbUrl}
            alt={`${word} 的语境配图`}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
