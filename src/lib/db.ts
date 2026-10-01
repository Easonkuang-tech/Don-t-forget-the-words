import Dexie, { type Table } from "dexie";
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
import {
  applyCloudReview,
  clearCloudData,
  deleteCloudCard,
  deleteCloudDeck,
  deleteCloudProject,
  fetchCloudSnapshot,
  importCloudSnapshot,
  seedCloudUser,
  subscribeToCloudUser,
  upsertCloudCard,
  upsertCloudDeck,
  upsertCloudProject,
  upsertCloudSettings
} from "./cloud";
import { isSupabaseConfigured } from "./supabase";

class MemoryDatabase extends Dexie {
  projects!: Table<Project, string>;
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("RepLoopLocal");
    this.version(1).stores({
      projects: "id, position, createdAt",
      decks: "id, projectId, position, createdAt",
      cards: "id, deckId, nextReviewAt, level, reviewCount, createdAt",
      reviewLogs:
        "id, cardId, reviewedAt, mode, reviewScope, affectsSchedule",
      settings: "id"
    });
  }
}

export const db = new MemoryDatabase();

let activeCloudUserId: string | null = null;
let cloudRealtimeChannel: RealtimeChannel | null = null;
let cloudSyncTimer: number | undefined;

export function isCloudDatabaseActive(): boolean {
  return activeCloudUserId !== null;
}

export function getActiveCloudUserId(): string | null {
  return activeCloudUserId;
}

async function readLocalSnapshot(): Promise<ReviewSnapshot> {
  const [projects, decks, cards, reviewLogs, settings] = await Promise.all([
    db.projects.toArray(),
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.settings.toArray()
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    projects,
    decks,
    cards,
    reviewLogs,
    settings: settings.length
      ? settings
      : [{ ...DEFAULT_SETTINGS, initialized: true }]
  };
}

async function applySnapshotToLocal(snapshot: ReviewSnapshot): Promise<void> {
  await db.transaction(
    "rw",
    db.projects,
    db.decks,
    db.cards,
    db.reviewLogs,
    db.settings,
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.decks.clear(),
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.settings.clear()
      ]);
      await db.projects.bulkPut(snapshot.projects);
      await db.decks.bulkPut(snapshot.decks);
      await db.cards.bulkPut(snapshot.cards);
      await db.reviewLogs.bulkPut(snapshot.reviewLogs);
      await db.settings.bulkPut(
        snapshot.settings.length
          ? snapshot.settings
          : [{ ...DEFAULT_SETTINGS, initialized: true }]
      );
    }
  );
}

function snapshotHasUserData(snapshot: ReviewSnapshot): boolean {
  return (
    snapshot.projects.length > 0 ||
    snapshot.decks.length > 0 ||
    snapshot.cards.length > 0 ||
    snapshot.reviewLogs.length > 0
  );
}

async function syncCloudToLocal(userId: string): Promise<void> {
  const snapshot = await fetchCloudSnapshot(userId);
  if (activeCloudUserId === userId) {
    await applySnapshotToLocal(snapshot);
  }
}

function scheduleCloudSync(userId: string): void {
  if (cloudSyncTimer !== undefined) {
    window.clearTimeout(cloudSyncTimer);
  }
  cloudSyncTimer = window.setTimeout(() => {
    void syncCloudToLocal(userId).catch((error) => {
      console.error("Supabase 同步失败", error);
    });
  }, 180);
}

export async function activateCloudUser(userId: string): Promise<void> {
  if (activeCloudUserId === userId && cloudRealtimeChannel) {
    return;
  }

  await deactivateCloudUser();

  const lastUserId = localStorage.getItem("reploop-last-cloud-user");
  if (lastUserId && lastUserId !== userId) {
    await applySnapshotToLocal({
      version: 1,
      exportedAt: Date.now(),
      projects: [],
      decks: [],
      cards: [],
      reviewLogs: [],
      settings: [{ ...DEFAULT_SETTINGS, initialized: true }]
    });
  }

  let remoteSnapshot = await fetchCloudSnapshot(userId);

  if (!snapshotHasUserData(remoteSnapshot)) {
    const localSnapshot = await readLocalSnapshot();
    if (snapshotHasUserData(localSnapshot) && !lastUserId) {
      await importCloudSnapshot(localSnapshot, true);
    } else if (!snapshotHasUserData(localSnapshot)) {
      await seedCloudUser(userId);
    }
    remoteSnapshot = await fetchCloudSnapshot(userId);
  }

  await applySnapshotToLocal(remoteSnapshot);
  activeCloudUserId = userId;
  localStorage.setItem("reploop-last-cloud-user", userId);

  cloudRealtimeChannel = subscribeToCloudUser(userId, () => {
    scheduleCloudSync(userId);
  });
}

export async function deactivateCloudUser(): Promise<void> {
  if (cloudSyncTimer !== undefined) {
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = undefined;
  }
  if (cloudRealtimeChannel) {
    await cloudRealtimeChannel.unsubscribe();
    cloudRealtimeChannel = null;
  }
  activeCloudUserId = null;
}

function identifier(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function initializeDatabase(): Promise<void> {
  if (isSupabaseConfigured) {
    return;
  }

  const settings = await db.settings.get("app");
  if (!settings) {
    await db.settings.put(DEFAULT_SETTINGS);
  }

  const current = settings ?? DEFAULT_SETTINGS;
  if (current.initialized) {
    return;
  }

  const now = Date.now();
  const projectId = identifier("project");
  const deckId = identifier("deck");

  await db.transaction("rw", db.projects, db.decks, db.settings, async () => {
    const projectCount = await db.projects.count();
    if (projectCount === 0) {
      await db.projects.add({
        id: projectId,
        name: "阅读",
        createdAt: now,
        updatedAt: now,
        position: 0
      });
      await db.decks.add({
        id: deckId,
        projectId,
        name: "默认卡组",
        createdAt: now,
        updatedAt: now,
        position: 0
      });
    }
    await db.settings.put({ ...current, initialized: true });
  });
}

export async function createProject(name: string): Promise<Project> {
  const now = Date.now();
  const count = await db.projects.count();
  const project: Project = {
    id: identifier("project"),
    name: name.trim() || "未命名项目",
    createdAt: now,
    updatedAt: now,
    position: count
  };
  if (activeCloudUserId) {
    await upsertCloudProject(activeCloudUserId, project);
  }
  await db.projects.add(project);
  return project;
}

export async function createDeck(
  projectId: string,
  name: string
): Promise<Deck> {
  const now = Date.now();
  const count = await db.decks.where("projectId").equals(projectId).count();
  const deck: Deck = {
    id: identifier("deck"),
    projectId,
    name: name.trim() || "未命名卡组",
    createdAt: now,
    updatedAt: now,
    position: count
  };
  if (activeCloudUserId) {
    await upsertCloudDeck(activeCloudUserId, deck);
  }
  await db.decks.add(deck);
  return deck;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const changes = {
    name: name.trim() || "未命名项目",
    updatedAt: Date.now()
  };
  if (activeCloudUserId) {
    const project = await db.projects.get(id);
    if (project) {
      await upsertCloudProject(activeCloudUserId, {
        ...project,
        ...changes
      });
    }
  }
  await db.projects.update(id, changes);
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const changes = {
    name: name.trim() || "未命名卡组",
    updatedAt: Date.now()
  };
  if (activeCloudUserId) {
    const deck = await db.decks.get(id);
    if (deck) {
      await upsertCloudDeck(activeCloudUserId, {
        ...deck,
        ...changes
      });
    }
  }
  await db.decks.update(id, changes);
}

async function removeCardsAndLogs(cardIds: string[]): Promise<void> {
  if (!cardIds.length) {
    return;
  }
  await db.reviewLogs.where("cardId").anyOf(cardIds).delete();
  await db.cards.bulkDelete(cardIds);
}

export async function deleteProject(id: string): Promise<void> {
  if (activeCloudUserId) {
    await deleteCloudProject(activeCloudUserId, id);
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  await db.transaction(
    "rw",
    db.projects,
    db.decks,
    db.cards,
    db.reviewLogs,
    async () => {
      const decks = await db.decks.where("projectId").equals(id).toArray();
      const deckIds = decks.map((deck) => deck.id);
      const cards = deckIds.length
        ? await db.cards.where("deckId").anyOf(deckIds).toArray()
        : [];
      await removeCardsAndLogs(cards.map((card) => card.id));
      if (deckIds.length) {
        await db.decks.bulkDelete(deckIds);
      }
      await db.projects.delete(id);
    }
  );
}

export async function deleteDeck(id: string): Promise<void> {
  if (activeCloudUserId) {
    await deleteCloudDeck(activeCloudUserId, id);
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
    const cards = await db.cards.where("deckId").equals(id).toArray();
    await removeCardsAndLogs(cards.map((card) => card.id));
    await db.decks.delete(id);
  });
}

export async function createCard(
  input: Omit<
    Card,
    | "id"
    | "level"
    | "nextReviewAt"
    | "lastReviewedAt"
    | "reviewCount"
    | "correctCount"
    | "createdAt"
    | "updatedAt"
  >
): Promise<Card> {
  const now = Date.now();
  const card: Card = {
    ...input,
    id: identifier("card"),
    level: 0,
    nextReviewAt: now,
    lastReviewedAt: null,
    reviewCount: 0,
    correctCount: 0,
    createdAt: now,
    updatedAt: now
  };
  if (activeCloudUserId) {
    await upsertCloudCard(activeCloudUserId, card);
  }
  await db.cards.add(card);
  return card;
}

export async function deleteCard(id: string): Promise<void> {
  if (activeCloudUserId) {
    await deleteCloudCard(activeCloudUserId, id);
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  await db.transaction("rw", db.cards, db.reviewLogs, async () => {
    await db.reviewLogs.where("cardId").equals(id).delete();
    await db.cards.delete(id);
  });
}

export async function updateCard(
  id: string,
  changes: Partial<Omit<Card, "id" | "createdAt">>
): Promise<void> {
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === "string") {
      trimmed[key] = value.trim();
    } else {
      trimmed[key] = value;
    }
  }
  const nextChanges = {
    ...trimmed,
    updatedAt: Date.now()
  };
  if (activeCloudUserId) {
    const card = await db.cards.get(id);
    if (card) {
      await upsertCloudCard(activeCloudUserId, {
        ...card,
        ...nextChanges
      } as Card);
    }
  }
  await db.cards.update(id, nextChanges);
}

export async function createCardLog(
  log: ReviewLog,
  affectsSchedule: boolean
): Promise<void> {
  if (activeCloudUserId) {
    await applyCloudReview(log, affectsSchedule);
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  await db.transaction("rw", db.cards, db.reviewLogs, async () => {
    await db.reviewLogs.add(log);
    if (!affectsSchedule) {
      return;
    }

    const card = await db.cards.get(log.cardId);
    if (!card) {
      return;
    }

    await db.cards.update(log.cardId, {
      level: log.levelAfter,
      nextReviewAt: log.nextReviewAt,
      lastReviewedAt: log.reviewedAt,
      reviewCount: card.reviewCount + 1,
      correctCount: card.correctCount + (log.isCorrect ? 1 : 0),
      updatedAt: log.reviewedAt
    });
  });
}

export async function exportSnapshot(): Promise<ReviewSnapshot> {
  if (activeCloudUserId) {
    try {
      return await fetchCloudSnapshot(activeCloudUserId);
    } catch (error) {
      console.error("云端快照读取失败，回退到本地缓存", error);
    }
  }

  const [projects, decks, cards, reviewLogs, settings] = await Promise.all([
    db.projects.toArray(),
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.settings.toArray()
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    projects,
    decks,
    cards,
    reviewLogs,
    settings
  };
}

function isSnapshot(value: unknown): value is ReviewSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ReviewSnapshot>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.decks) &&
    Array.isArray(candidate.cards) &&
    Array.isArray(candidate.reviewLogs)
  );
}

export async function importSnapshot(
  value: unknown,
  strategy: "merge" | "replace" = "merge"
): Promise<void> {
  if (!isSnapshot(value)) {
    throw new Error("备份文件格式不正确");
  }

  if (activeCloudUserId) {
    await importCloudSnapshot(value, strategy === "replace");
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  const settings = value.settings?.length
    ? value.settings
    : [{ ...DEFAULT_SETTINGS, initialized: true }];

  await db.transaction(
    "rw",
    db.projects,
    db.decks,
    db.cards,
    db.reviewLogs,
    db.settings,
    async () => {
      if (strategy === "replace") {
        await Promise.all([
          db.projects.clear(),
          db.decks.clear(),
          db.cards.clear(),
          db.reviewLogs.clear(),
          db.settings.clear()
        ]);
      }

      await db.projects.bulkPut(value.projects);
      await db.decks.bulkPut(value.decks);
      await db.cards.bulkPut(value.cards);
      await db.reviewLogs.bulkPut(value.reviewLogs);
      await db.settings.bulkPut(settings);
    }
  );
}

export async function clearDatabase(): Promise<void> {
  if (activeCloudUserId) {
    await clearCloudData();
    await syncCloudToLocal(activeCloudUserId);
    return;
  }

  await db.transaction(
    "rw",
    db.projects,
    db.decks,
    db.cards,
    db.reviewLogs,
    db.settings,
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.decks.clear(),
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.settings.clear()
      ]);
      await db.settings.put({ ...DEFAULT_SETTINGS, initialized: true });
    }
  );
}

export async function updateSettings(
  changes: Partial<AppSettings>
): Promise<void> {
  const current = (await db.settings.get("app")) ?? {
    ...DEFAULT_SETTINGS,
    initialized: true
  };
  const next = {
    ...current,
    ...changes,
    id: "app" as const,
    initialized: true
  };

  if (activeCloudUserId) {
    await upsertCloudSettings(activeCloudUserId, next);
  }
  await db.settings.put(next);
}
