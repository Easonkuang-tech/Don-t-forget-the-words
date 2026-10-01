import type {
  Card,
  CardCategory,
  ReviewLog
} from "../types";
import { dateKey, startOfDay } from "./format";

export interface CategoryDistribution {
  mastered: number;
  learning: number;
  difficult: number;
  unseen: number;
}

export interface ForecastPoint {
  date: string;
  label: string;
  count: number;
}

export interface DashboardStats {
  todayReviewed: number;
  todayCreated: number;
  todayCorrectRate: number;
  todayAverageTimeMs: number;
  totalCards: number;
  masteredCount: number;
  learnedDays: number;
  streak: number;
  distribution: CategoryDistribution;
  forecast: ForecastPoint[];
}

export function recentLogsForCard(
  cardId: string,
  logs: ReviewLog[]
): ReviewLog[] {
  return logs
    .filter((log) => log.cardId === cardId)
    .sort((left, right) => right.reviewedAt - left.reviewedAt)
    .slice(0, 2);
}

export function classifyCard(card: Card, logs: ReviewLog[]): CardCategory {
  const recent = recentLogsForCard(card.id, logs);
  if (!recent.length) {
    return "unseen";
  }

  const recentWrongCount = recent.filter((log) => !log.isCorrect).length;
  const latestRating = recent[0].userRating;

  if (recentWrongCount >= 2 || latestRating === "forgot") {
    return "difficult";
  }

  if (
    card.level >= 5 &&
    (latestRating === "good" || latestRating === "easy")
  ) {
    return "mastered";
  }

  return "learning";
}

export function getCategoryDistribution(
  cards: Card[],
  logs: ReviewLog[]
): CategoryDistribution {
  const distribution: CategoryDistribution = {
    mastered: 0,
    learning: 0,
    difficult: 0,
    unseen: 0
  };

  for (const card of cards) {
    distribution[classifyCard(card, logs)] += 1;
  }

  return distribution;
}

export function getForecast(
  cards: Card[],
  now = Date.now(),
  days = 7
): ForecastPoint[] {
  const result: ForecastPoint[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(startOfDay(now));
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    const end = date.getTime() + 24 * 60 * 60 * 1_000;
    const count = cards.filter(
      (card) => card.nextReviewAt >= date.getTime() && card.nextReviewAt < end
    ).length;

    result.push({
      date: key,
      label:
        index === 0
          ? "今天"
          : index === 1
            ? "明天"
            : `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`,
      count
    });
  }

  return result;
}

export function calculateStreak(logs: ReviewLog[], now = Date.now()): number {
  if (!logs.length) {
    return 0;
  }

  const learnedDays = new Set(logs.map((log) => dateKey(log.reviewedAt)));
  const cursor = new Date(startOfDay(now));
  const todayKey = dateKey(cursor);

  if (!learnedDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (learnedDays.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function calculateDashboardStats(
  cards: Card[],
  logs: ReviewLog[],
  now = Date.now()
): DashboardStats {
  const todayStart = startOfDay(now);
  const todayEnd = todayStart + 24 * 60 * 60 * 1_000;
  const todayLogs = logs.filter(
    (log) => log.reviewedAt >= todayStart && log.reviewedAt < todayEnd
  );
  const todayCards = cards.filter(
    (card) => card.createdAt >= todayStart && card.createdAt < todayEnd
  );
  const correctCount = todayLogs.filter((log) => log.isCorrect).length;
  const averageTime = todayLogs.length
    ? todayLogs.reduce((sum, log) => sum + log.totalTimeMs, 0) / todayLogs.length
    : 0;
  const distribution = getCategoryDistribution(cards, logs);
  const learnedDays = new Set(logs.map((log) => dateKey(log.reviewedAt))).size;

  return {
    todayReviewed: todayLogs.length,
    todayCreated: todayCards.length,
    todayCorrectRate: todayLogs.length
      ? correctCount / todayLogs.length
      : 0,
    todayAverageTimeMs: averageTime,
    totalCards: cards.length,
    masteredCount: distribution.mastered,
    learnedDays,
    streak: calculateStreak(logs, now),
    distribution,
    forecast: getForecast(cards, now)
  };
}
