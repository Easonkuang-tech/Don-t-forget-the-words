import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Layers3,
  Target
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { MetricTile } from "../components/MetricTile";
import { db } from "../lib/db";
import {
  calculateDashboardStats,
  type CategoryDistribution,
  type ForecastPoint
} from "../lib/stats";
import {
  dateKey,
  formatDuration,
  startOfDay
} from "../lib/format";
import type { Card, ReviewLog } from "../types";

export function StatsPage() {
  const cards =
    useLiveQuery(() => db.cards.toArray(), [], [] as Card[]) ?? [];
  const logs =
    useLiveQuery(
      () => db.reviewLogs.orderBy("reviewedAt").reverse().toArray(),
      [],
      [] as ReviewLog[]
    ) ?? [];
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const stats = useMemo(
    () => calculateDashboardStats(cards, logs),
    [cards, logs]
  );

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">学习轨迹</p>
          <h1>统计</h1>
        </div>
        <span className="streak-chip">
          <Flame size={16} />
          连续 {stats.streak} 天
        </span>
      </header>

      <section className="dashboard-band">
        <MetricTile
          label="今日学习"
          value={stats.todayReviewed}
          note="张卡片"
          tone="green"
        />
        <MetricTile
          label="今日创建"
          value={stats.todayCreated}
          note="张卡片"
          tone="blue"
        />
        <MetricTile
          label="今日正确率"
          value={`${Math.round(stats.todayCorrectRate * 100)}%`}
          note="首次作答"
          tone="amber"
        />
        <MetricTile
          label="平均用时"
          value={formatDuration(stats.todayAverageTimeMs)}
          note="每张卡片"
          tone="red"
        />
      </section>

      <section className="stats-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">历史</p>
            <h2>学习日历</h2>
          </div>
          <span className="section-meta">
            累计 {stats.learnedDays} 天 · {stats.totalCards} 张卡片
          </span>
        </header>
        <LearningCalendar
          month={monthCursor}
          logs={logs}
          onMonthChange={setMonthCursor}
        />
      </section>

      <section className="stats-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">预测</p>
            <h2>未来一周复习量</h2>
          </div>
        </header>
        <ForecastChart points={stats.forecast} />
      </section>

      <section className="stats-section mastery-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">掌握情况</p>
            <h2>全部卡片</h2>
          </div>
        </header>
        <MasteryDonut
          distribution={stats.distribution}
          total={stats.totalCards}
        />
      </section>
    </div>
  );
}

function LearningCalendar({
  month,
  logs,
  onMonthChange
}: {
  month: Date;
  logs: ReviewLog[];
  onMonthChange: (value: Date) => void;
}) {
  const activeDays = new Set(logs.map((log) => dateKey(log.reviewedAt)));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = dateKey(Date.now());
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
  ];

  return (
    <div className="calendar">
      <header>
        <button
          type="button"
          className="icon-button compact"
          onClick={() =>
            onMonthChange(new Date(year, monthIndex - 1, 1))
          }
          aria-label="上个月"
        >
          <ChevronLeft size={16} />
        </button>
        <strong>
          {year}.{String(monthIndex + 1).padStart(2, "0")}
        </strong>
        <button
          type="button"
          className="icon-button compact"
          onClick={() =>
            onMonthChange(new Date(year, monthIndex + 1, 1))
          }
          aria-label="下个月"
        >
          <ChevronRight size={16} />
        </button>
      </header>
      <div className="calendar-weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (day === null) {
            return <span className="calendar-empty" key={`empty-${index}`} />;
          }
          const key = dateKey(new Date(year, monthIndex, day));
          const isLearned = activeDays.has(key);
          const isToday = key === todayKey;
          return (
            <span
              key={key}
              className={`${isLearned ? "is-learned" : ""} ${isToday ? "is-today" : ""}`}
              title={isLearned ? "有学习记录" : undefined}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const maxValue = Math.max(1, ...points.map((point) => point.count));
  const width = 640;
  const height = 220;
  const left = 42;
  const right = 18;
  const top = 26;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = points.map((point, index) => {
    const x =
      left + (index * plotWidth) / Math.max(1, points.length - 1);
    const y = top + plotHeight - (point.count / maxValue) * plotHeight;
    return { ...point, x, y };
  });
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="forecast-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="未来一周复习量折线图"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight * ratio;
          return (
            <line
              key={ratio}
              x1={left}
              x2={width - right}
              y1={y}
              y2={y}
              className="chart-grid-line"
            />
          );
        })}
        <path d={path} className="chart-line" />
        {coordinates.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="5" className="chart-dot" />
            <text x={point.x} y={point.y - 13} className="chart-value">
              {point.count}
            </text>
            <text x={point.x} y={height - 14} className="chart-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MasteryDonut({
  distribution,
  total
}: {
  distribution: CategoryDistribution;
  total: number;
}) {
  const masteredPercent = total ? (distribution.mastered / total) * 100 : 0;
  const learningPercent = total ? (distribution.learning / total) * 100 : 0;
  const difficultPercent = total ? (distribution.difficult / total) * 100 : 0;
  const masteredEnd = masteredPercent;
  const learningEnd = masteredEnd + learningPercent;
  const difficultEnd = learningEnd + difficultPercent;
  const background = total
    ? `conic-gradient(
        var(--green) 0 ${masteredEnd}%,
        var(--blue) ${masteredEnd}% ${learningEnd}%,
        var(--red) ${learningEnd}% ${difficultEnd}%,
        var(--amber) ${difficultEnd}% 100%
      )`
    : "conic-gradient(var(--line) 0 100%)";

  return (
    <div className="mastery-layout">
      <div className="donut-chart" style={{ background }}>
        <div>
          <strong>{total}</strong>
          <span>总计</span>
        </div>
      </div>
      <div className="mastery-legend">
        <LegendItem
          color="green"
          label="已掌握"
          value={distribution.mastered}
          total={total}
        />
        <LegendItem
          color="blue"
          label="学习中"
          value={distribution.learning}
          total={total}
        />
        <LegendItem
          color="red"
          label="疑难"
          value={distribution.difficult}
          total={total}
        />
        <LegendItem
          color="amber"
          label="未学习"
          value={distribution.unseen}
          total={total}
        />
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  value,
  total
}: {
  color: "green" | "blue" | "red" | "amber";
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="legend-item">
      <span className={`legend-dot dot-${color}`} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{total ? `${((value / total) * 100).toFixed(1)}%` : "0%"}</small>
    </div>
  );
}
