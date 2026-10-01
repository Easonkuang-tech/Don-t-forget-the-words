export type ContentType = "word" | "phrase" | "sentence";
export type ReviewMode = "cloze" | "typing" | "choice";
export type SessionMode = ReviewMode | "mixed";
export type ReviewScope = "focused" | "random";
export type TypingVariant = "test" | "hint";
export type Rating = "forgot" | "hard" | "good" | "easy";
export type SpeedBand = "fast" | "normal" | "slow";
export type CardCategory =
  | "mastered"
  | "learning"
  | "difficult"
  | "unseen";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  position: number;
}

export interface Deck {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  position: number;
}

export interface Card {
  id: string;
  deckId: string;
  contentType: ContentType;
  english: string;
  chinese: string;
  target: string;
  sentence: string;
  sentenceTranslation: string;
  phonetic: string;
  definitionEn: string;
  definitionZh: string;
  partOfSpeech: string;
  tags: string[];
  source: "manual" | "template" | "dictionary" | "translation";
  level: number;
  nextReviewAt: number;
  lastReviewedAt: number | null;
  reviewCount: number;
  correctCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  mode: ReviewMode;
  reviewScope: ReviewScope;
  answer: string;
  correctAnswer: string;
  isCorrect: boolean;
  attempts: number;
  systemRating: Rating;
  userRating: Rating;
  reactionTimeMs: number;
  answerTimeMs: number;
  totalTimeMs: number;
  speedBand: SpeedBand;
  levelBefore: number;
  levelAfter: number;
  nextReviewAt: number;
  affectsSchedule: boolean;
  reviewedAt: number;
}

export interface AppSettings {
  id: "app";
  dailyNewLimit: 10 | 20 | 35 | 50 | 80;
  notificationEnabled: boolean;
  notificationTime: string;
  initialized: boolean;
}

export interface DictionaryEntry {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
  collins?: string | number;
  oxford?: string | number;
  tag?: string;
  bnc?: string | number;
  frq?: string | number;
  exchange?: string;
  detail?: string;
  audio?: string;
}

export interface DictionaryLookupResult {
  found: boolean;
  query: string;
  entries: DictionaryEntry[];
  suggestions: string[];
}

export interface ReviewQuestion {
  id: string;
  card: Card;
  mode: ReviewMode;
  cloze: {
    before: string;
    target: string;
    after: string;
  } | null;
  options: string[];
  correctOptionIndex: number;
}

export interface ReviewSessionRequest {
  scope: ReviewScope;
  mode: SessionMode;
  deckId?: string;
  typingVariant?: TypingVariant;
}

export interface ReviewSnapshot {
  version: 1;
  exportedAt: number;
  projects: Project[];
  decks: Deck[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  settings: AppSettings[];
}
