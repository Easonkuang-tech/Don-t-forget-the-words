export interface Project {
  id: string;
  name: string;
  position: number;
}

export interface Deck {
  id: string;
  project_id: string;
  name: string;
  position: number;
}

export interface Card {
  id: string;
  user_id: string;
  deck_id: string;
  content_type: "word" | "phrase" | "sentence";
  english: string;
  chinese: string;
  target: string;
  sentence: string;
  sentence_translation: string;
  phonetic: string;
  definition_en: string;
  definition_zh: string;
  part_of_speech: string;
  tags: string[];
  source: string;
  level: number;
  next_review_at: number;
  last_reviewed_at: number | null;
  review_count: number;
  correct_count: number;
  created_at: number;
  updated_at: number;
}

export interface DictionaryEntry {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
}
