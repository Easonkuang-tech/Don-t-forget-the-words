import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  AppSettings,
  Card,
  Deck,
  Project,
  ReviewLog,
  ReviewSnapshot
} from "../types";
import { DEFAULT_SETTINGS } from "./constants";
import { requireSupabase } from "./supabase";

const TABLES = [
  "projects",
  "decks",
  "cards",
  "review_logs",
  "user_settings"
] as const;

type UnknownRow = Record<string, unknown>;

function expectData<T>(data: T | null, error: unknown): T {
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return data as T;
}

function projectRow(userId: string, project: Project): UnknownRow {
  return {
    user_id: userId,
    id: project.id,
    name: project.name,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    position: project.position
  };
}

function deckRow(userId: string, deck: Deck): UnknownRow {
  return {
    user_id: userId,
    id: deck.id,
    project_id: deck.projectId,
    name: deck.name,
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    position: deck.position
  };
}

function cardRow(userId: string, card: Card): UnknownRow {
  return {
    user_id: userId,
    id: card.id,
    deck_id: card.deckId,
    content_type: card.contentType,
    english: card.english,
    chinese: card.chinese,
    target: card.target,
    sentence: card.sentence,
    sentence_translation: card.sentenceTranslation,
    phonetic: card.phonetic,
    definition_en: card.definitionEn,
    definition_zh: card.definitionZh,
    part_of_speech: card.partOfSpeech,
    tags: card.tags,
    source: card.source,
    level: card.level,
    next_review_at: card.nextReviewAt,
    last_reviewed_at: card.lastReviewedAt,
    review_count: card.reviewCount,
    correct_count: card.correctCount,
    created_at: card.createdAt,
    updated_at: card.updatedAt
  };
}

function reviewLogRow(userId: string, log: ReviewLog): UnknownRow {
  return {
    user_id: userId,
    id: log.id,
    card_id: log.cardId,
    mode: log.mode,
    review_scope: log.reviewScope,
    answer: log.answer,
    correct_answer: log.correctAnswer,
    is_correct: log.isCorrect,
    attempts: log.attempts,
    system_rating: log.systemRating,
    user_rating: log.userRating,
    reaction_time_ms: log.reactionTimeMs,
    answer_time_ms: log.answerTimeMs,
    total_time_ms: log.totalTimeMs,
    speed_band: log.speedBand,
    level_before: log.levelBefore,
    level_after: log.levelAfter,
    next_review_at: log.nextReviewAt,
    affects_schedule: log.affectsSchedule,
    reviewed_at: log.reviewedAt
  };
}

function settingsRow(userId: string, settings: AppSettings): UnknownRow {
  return {
    user_id: userId,
    daily_new_limit: settings.dailyNewLimit,
    notification_enabled: settings.notificationEnabled,
    notification_time: settings.notificationTime,
    initialized: settings.initialized,
    updated_at: Date.now()
  };
}

function fromProjectRow(row: UnknownRow): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    position: Number(row.position ?? 0)
  };
}

function fromDeckRow(row: UnknownRow): Deck {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    position: Number(row.position ?? 0)
  };
}

function fromCardRow(row: UnknownRow): Card {
  return {
    id: String(row.id),
    deckId: String(row.deck_id),
    contentType: row.content_type as Card["contentType"],
    english: String(row.english ?? ""),
    chinese: String(row.chinese ?? ""),
    target: String(row.target ?? ""),
    sentence: String(row.sentence ?? ""),
    sentenceTranslation: String(row.sentence_translation ?? ""),
    phonetic: String(row.phonetic ?? ""),
    definitionEn: String(row.definition_en ?? ""),
    definitionZh: String(row.definition_zh ?? ""),
    partOfSpeech: String(row.part_of_speech ?? ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    source: row.source as Card["source"],
    level: Number(row.level ?? 0),
    nextReviewAt: Number(row.next_review_at ?? Date.now()),
    lastReviewedAt:
      row.last_reviewed_at === null || row.last_reviewed_at === undefined
        ? null
        : Number(row.last_reviewed_at),
    reviewCount: Number(row.review_count ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function fromReviewLogRow(row: UnknownRow): ReviewLog {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    mode: row.mode as ReviewLog["mode"],
    reviewScope: row.review_scope as ReviewLog["reviewScope"],
    answer: String(row.answer ?? ""),
    correctAnswer: String(row.correct_answer ?? ""),
    isCorrect: Boolean(row.is_correct),
    attempts: Number(row.attempts ?? 1),
    systemRating: row.system_rating as ReviewLog["systemRating"],
    userRating: row.user_rating as ReviewLog["userRating"],
    reactionTimeMs: Number(row.reaction_time_ms ?? 0),
    answerTimeMs: Number(row.answer_time_ms ?? 0),
    totalTimeMs: Number(row.total_time_ms ?? 0),
    speedBand: row.speed_band as ReviewLog["speedBand"],
    levelBefore: Number(row.level_before ?? 0),
    levelAfter: Number(row.level_after ?? 0),
    nextReviewAt: Number(row.next_review_at),
    affectsSchedule: Boolean(row.affects_schedule),
    reviewedAt: Number(row.reviewed_at)
  };
}

function fromSettingsRow(row: UnknownRow | undefined): AppSettings {
  if (!row) {
    return { ...DEFAULT_SETTINGS, initialized: true };
  }
  return {
    id: "app",
    dailyNewLimit: Number(row.daily_new_limit ?? 10) as AppSettings["dailyNewLimit"],
    notificationEnabled: Boolean(row.notification_enabled),
    notificationTime: String(row.notification_time ?? "09:30"),
    initialized: true
  };
}

export async function fetchCloudSnapshot(
  userId: string
): Promise<ReviewSnapshot> {
  const client = requireSupabase();
  const [projectResult, deckResult, cardResult, logResult, settingResult] =
    await Promise.all([
      client.from("projects").select("*").eq("user_id", userId),
      client.from("decks").select("*").eq("user_id", userId),
      client.from("cards").select("*").eq("user_id", userId),
      client.from("review_logs").select("*").eq("user_id", userId),
      client.from("user_settings").select("*").eq("user_id", userId).maybeSingle()
    ]);

  const projects = expectData(projectResult.data, projectResult.error) ?? [];
  const decks = expectData(deckResult.data, deckResult.error) ?? [];
  const cards = expectData(cardResult.data, cardResult.error) ?? [];
  const reviewLogs = expectData(logResult.data, logResult.error) ?? [];
  const setting = expectData(settingResult.data, settingResult.error);

  return {
    version: 1,
    exportedAt: Date.now(),
    projects: projects.map((row) => fromProjectRow(row)),
    decks: decks.map((row) => fromDeckRow(row)),
    cards: cards.map((row) => fromCardRow(row)),
    reviewLogs: reviewLogs.map((row) => fromReviewLogRow(row)),
    settings: [fromSettingsRow(setting ?? undefined)]
  };
}

export async function upsertCloudProject(
  userId: string,
  project: Project
): Promise<void> {
  const result = await requireSupabase()
    .from("projects")
    .upsert(projectRow(userId, project), { onConflict: "user_id,id" });
  expectData(true, result.error);
}

export async function upsertCloudDeck(
  userId: string,
  deck: Deck
): Promise<void> {
  const result = await requireSupabase()
    .from("decks")
    .upsert(deckRow(userId, deck), { onConflict: "user_id,id" });
  expectData(true, result.error);
}

export async function upsertCloudCard(
  userId: string,
  card: Card
): Promise<void> {
  const result = await requireSupabase()
    .from("cards")
    .upsert(cardRow(userId, card), { onConflict: "user_id,id" });
  expectData(true, result.error);
}

export async function upsertCloudSettings(
  userId: string,
  settings: AppSettings
): Promise<void> {
  const result = await requireSupabase()
    .from("user_settings")
    .upsert(settingsRow(userId, settings), { onConflict: "user_id" });
  expectData(true, result.error);
}

export async function deleteCloudProject(
  userId: string,
  projectId: string
): Promise<void> {
  const result = await requireSupabase()
    .from("projects")
    .delete()
    .eq("user_id", userId)
    .eq("id", projectId);
  expectData(true, result.error);
}

export async function deleteCloudDeck(
  userId: string,
  deckId: string
): Promise<void> {
  const result = await requireSupabase()
    .from("decks")
    .delete()
    .eq("user_id", userId)
    .eq("id", deckId);
  expectData(true, result.error);
}

export async function deleteCloudCard(
  userId: string,
  cardId: string
): Promise<void> {
  const result = await requireSupabase()
    .from("cards")
    .delete()
    .eq("user_id", userId)
    .eq("id", cardId);
  expectData(true, result.error);
}

export async function applyCloudReview(
  log: ReviewLog,
  affectsSchedule: boolean
): Promise<void> {
  const result = await requireSupabase().rpc("apply_review_log", {
    p_log: log,
    p_affects_schedule: affectsSchedule
  });
  expectData(true, result.error);
}

export async function importCloudSnapshot(
  snapshot: ReviewSnapshot,
  replace: boolean
): Promise<void> {
  const result = await requireSupabase().rpc("import_reploop_snapshot", {
    p_snapshot: snapshot,
    p_replace: replace
  });
  expectData(true, result.error);
}

export async function clearCloudData(): Promise<void> {
  const result = await requireSupabase().rpc("clear_user_data");
  expectData(true, result.error);
}

export async function seedCloudUser(userId: string): Promise<void> {
  const now = Date.now();
  const projectId = `project_${crypto.randomUUID()}`;
  const deckId = `deck_${crypto.randomUUID()}`;

  await upsertCloudProject(userId, {
    id: projectId,
    name: "阅读",
    createdAt: now,
    updatedAt: now,
    position: 0
  });
  await upsertCloudDeck(userId, {
    id: deckId,
    projectId,
    name: "默认卡组",
    createdAt: now,
    updatedAt: now,
    position: 0
  });
  await upsertCloudSettings(userId, {
    ...DEFAULT_SETTINGS,
    initialized: true
  });
}

export function subscribeToCloudUser(
  userId: string,
  onChange: () => void
): RealtimeChannel {
  const client = requireSupabase();
  const channel = client.channel(`reploop-user-${userId}`);

  for (const table of TABLES) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `user_id=eq.${userId}`
      },
      onChange
    );
  }

  return channel.subscribe();
}
