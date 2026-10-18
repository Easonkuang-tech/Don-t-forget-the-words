import type { LanguageCode } from "../types";

export interface CardImageInput {
  word: string;
  meaning?: string;
  definition?: string;
  language: LanguageCode;
}

export interface CardImage {
  found: boolean;
  query: string;
  provider: string;
  imageUrl: string;
  imageThumbUrl: string;
  sourceUrl: string;
  attribution: string;
}

export const EMPTY_CARD_IMAGE: CardImage = {
  found: false,
  query: "",
  provider: "",
  imageUrl: "",
  imageThumbUrl: "",
  sourceUrl: "",
  attribution: ""
};

function normalizeResult(value: unknown): CardImage {
  if (!value || typeof value !== "object") {
    return EMPTY_CARD_IMAGE;
  }
  const data = value as Partial<CardImage>;
  return {
    found: Boolean(data.found && data.imageUrl),
    query: String(data.query ?? ""),
    provider: String(data.provider ?? ""),
    imageUrl: String(data.imageUrl ?? ""),
    imageThumbUrl: String(data.imageThumbUrl ?? data.imageUrl ?? ""),
    sourceUrl: String(data.sourceUrl ?? ""),
    attribution: String(data.attribution ?? "")
  };
}

export async function findCardImage(
  input: CardImageInput,
  signal?: AbortSignal
): Promise<CardImage> {
  const word = input.word.trim();
  if (!word) {
    return EMPTY_CARD_IMAGE;
  }
  try {
    const response = await fetch("/api/card-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word,
        meaning: input.meaning ?? "",
        definition: input.definition ?? "",
        language: input.language
      }),
      signal
    });
    if (!response.ok) {
      return EMPTY_CARD_IMAGE;
    }
    return normalizeResult(await response.json());
  } catch {
    return EMPTY_CARD_IMAGE;
  }
}

export function cardImageFields(image: CardImage): {
  imageUrl: string;
  imageThumbUrl: string;
  imageAttribution: string;
  imageSourceUrl: string;
} {
  return {
    imageUrl: image.imageUrl,
    imageThumbUrl: image.imageThumbUrl || image.imageUrl,
    imageAttribution: image.attribution,
    imageSourceUrl: image.sourceUrl
  };
}
