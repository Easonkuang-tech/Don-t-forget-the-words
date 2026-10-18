import type { LanguageCode } from "../types";
import { supabase } from "./supabase";

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
  origin?: "user" | "auto" | "";
}

export const EMPTY_CARD_IMAGE: CardImage = {
  found: false,
  query: "",
  provider: "",
  imageUrl: "",
  imageThumbUrl: "",
  sourceUrl: "",
    attribution: "",
    origin: ""
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
    attribution: String(data.attribution ?? ""),
    origin: ""
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
  imageOrigin: "user" | "auto" | "";
} {
  return {
    imageUrl: image.imageUrl,
    imageThumbUrl: image.imageThumbUrl || image.imageUrl,
    imageAttribution: image.attribution,
    imageSourceUrl: image.sourceUrl,
    imageOrigin: image.origin === "user" ? "user" : "auto"
  };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("无法读取图片"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("图片不能超过 12MB");
  }

  const image = await loadImage(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法处理图片");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82)
  );
  if (!blob) {
    throw new Error("图片压缩失败");
  }
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", 0.82) };
}

export async function uploadCardImage(file: File): Promise<{
  imageUrl: string;
  imageThumbUrl: string;
  imageAttribution: string;
  imageSourceUrl: string;
  imageOrigin: "user" | "auto";
}> {
  const { blob, dataUrl } = await compressImage(file);
  const userId = supabase
    ? (await supabase.auth.getSession()).data.session?.user.id
    : null;

  if (userId && supabase) {
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("card-images")
      .upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false
      });
    if (error) {
      throw new Error(
        "图片上传失败，请确认 Supabase 存储迁移已经执行"
      );
    }
    const { data } = supabase.storage.from("card-images").getPublicUrl(path);
    return {
      imageUrl: data.publicUrl,
      imageThumbUrl: data.publicUrl,
      imageAttribution: "用户上传",
      imageSourceUrl: "",
      imageOrigin: "user"
    };
  }

  return {
    imageUrl: dataUrl,
    imageThumbUrl: dataUrl,
    imageAttribution: "用户上传",
    imageSourceUrl: "",
    imageOrigin: "user"
  };
}
