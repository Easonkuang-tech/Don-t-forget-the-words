import type { Rating, ReviewMode } from "../types";

export const DAY_MS = 24 * 60 * 60 * 1_000;
export const MINUTE_MS = 60 * 1_000;

export function startOfDay(value: number | Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addDays(value: number | Date, amount: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function dateKey(value: number | Date): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatShortDate(value: number | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(value);
}

export function formatFullDate(value: number | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(value);
}

export function formatRelativeDue(value: number, now = Date.now()): string {
  const difference = value - now;
  if (difference <= 0) {
    return "现在";
  }
  if (difference < 60 * MINUTE_MS) {
    return `${Math.max(1, Math.ceil(difference / MINUTE_MS))} 分钟后`;
  }
  if (difference < DAY_MS) {
    return `${Math.ceil(difference / (60 * MINUTE_MS))} 小时后`;
  }
  return `${Math.ceil(difference / DAY_MS)} 天后`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000;
  if (seconds < 1) {
    return "<1 秒";
  }
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const resultSeconds = Math.round(seconds % 60);
  return `${minutes} 分 ${resultSeconds} 秒`;
}

export function ratingLabel(rating: Rating): string {
  const labels: Record<Rating, string> = {
    forgot: "忘记",
    hard: "困难",
    good: "良好",
    easy: "简单"
  };
  return labels[rating];
}

export function modeLabel(mode: ReviewMode): string {
  const labels: Record<ReviewMode, string> = {
    cloze: "挖空默写",
    typing: "中文默写",
    choice: "四选一"
  };
  return labels[mode];
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
