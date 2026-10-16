import type { Deck, LanguageCode } from "../types";

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGE_OPTIONS: {
  value: LanguageCode;
  label: string;
  native: string;
}[] = [
  { value: "en", label: "英语", native: "English" },
  { value: "fr", label: "法语", native: "Français" }
];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "en" || value === "fr";
}

export function resolveLanguage(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

export function deckLanguage(
  deck: Pick<Deck, "language"> | null | undefined
): LanguageCode {
  return resolveLanguage(deck?.language);
}

export function languageLabel(language: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((item) => item.value === language)?.label ?? "英语";
}

export function languageName(language: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((item) => item.value === language)?.native ?? "English";
}

export function speechLanguage(language: LanguageCode): string {
  return language === "fr" ? "fr-FR" : "en-US";
}
