import {
  CalendarClock,
  ChevronRight,
  Clock3,
  FolderKanban,
  Pencil,
  Play,
  Plus,
  Trash2
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { MetricTile } from "../components/MetricTile";
import { Modal } from "../components/Modal";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  createDeck,
  createProject,
  db,
  deleteDeck,
  deleteProject,
  renameDeck,
  renameProject
} from "../lib/db";
import { DAY_MS, formatFullDate } from "../lib/format";
import type {
  Deck,
  Project,
  ReviewSessionRequest,
  SessionMode,
  TypingVariant
} from "../types";

const TYPING_VARIANT_KEY = "reloop:typing-variant";

function readTypingVariant(): TypingVariant {
  try {
    return window.localStorage.getItem(TYPING_VARIANT_KEY) === "hint"
      ? "hint"
      : "test";
  } catch {
    return "test";
  }
}

interface HomePageProps {
  onStartReview: (request: ReviewSessionRequest) => void;
  onOpenDeck: (deckId: string) => void;
}

type EditorState =
  | { kind: "project"; value?: Project }
  | { kind: "deck"; projectId: string; value?: Deck }
  | null;

export function HomePage({ onStartReview, onOpenDeck }: HomePageProps) {
  const projects =
    useLiveQuery(
      () => db.projects.orderBy("position").toArray(),
      [],
      [] as Project[]
    ) ?? [];
  const decks =
    useLiveQuery(() => db.decks.orderBy("position").toArray(), [], [] as Deck[]) ??
    [];
  const cards = useLiveQuery(() => db.cards.toArray(), [], []) ?? [];
  const settings = useLiveQuery(() => db.settings.get("app"));

  const [editor, setEditor] = useState<EditorState>(null);
  const [editorName, setEditorName] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDeckId, setSetupDeckId] = useState("");
  const [setupScope, setSetupScope] = useState<"focused" | "random">(
    "focused"
  );
  const [setupMode, setSetupMode] = useState<SessionMode>("mixed");
  const [setupTypingVariant, setSetupTypingVariant] = useState<TypingVariant>(
    readTypingVariant
  );

  const dashboard = useMemo(() => {
    const now = Date.now();
    const dailyLimit = settings?.dailyNewLimit ?? 10;
    const dueReview = cards.filter(
      (card) => card.reviewCount > 0 && card.nextReviewAt <= now
    ).length;
    const candidateNew = cards.filter(
      (card) =>
        card.reviewCount === 0 &&
        card.createdAt < now + 24 * 60 * 60 * 1_000
    ).length;
    const newCount = Math.min(dailyLimit, candidateNew);
    const estimatedMinutes = Math.ceil(((dueReview + newCount) * 12) / 60);
    const reviewedToday = cards.filter(
      (card) =>
        card.lastReviewedAt !== null &&
        card.lastReviewedAt >= new Date().setHours(0, 0, 0, 0)
    ).length;
    const totalPlanned = dueReview + newCount;
    const completion =
      totalPlanned > 0
        ? Math.max(0, Math.min(1, reviewedToday / totalPlanned))
        : 0;

    return {
      dueReview,
      newCount,
      estimatedMinutes,
      completion
    };
  }, [cards, settings?.dailyNewLimit]);

  const openEditor = (next: EditorState) => {
    setEditor(next);
    setEditorName(
      next?.kind === "project"
        ? next.value?.name ?? ""
        : next?.kind === "deck"
          ? next.value?.name ?? ""
          : ""
    );
  };

  const saveEditor = async () => {
    if (!editor) {
      return;
    }
    if (editor.kind === "project") {
      if (editor.value) {
        await renameProject(editor.value.id, editorName);
      } else {
        await createProject(editorName);
      }
    } else if (editor.value) {
      await renameDeck(editor.value.id, editorName);
    } else {
      await createDeck(editor.projectId, editorName);
    }
    setEditor(null);
  };

  const openSetup = (deckId = "") => {
    setSetupDeckId(deckId || decks[0]?.id || "");
    setSetupScope(deckId ? "focused" : "focused");
    setSetupMode("mixed");
    setSetupOpen(true);
  };

  const startReview = () => {
    if (!cards.length) {
      return;
    }
    if (setupMode === "typing") {
      try {
        window.localStorage.setItem(TYPING_VARIANT_KEY, setupTypingVariant);
      } catch {
        /* 忽略隐私模式下的存储失败 */
      }
    }
    onStartReview({
      scope: setupScope,
      mode: setupMode,
      deckId: setupScope === "focused" ? setupDeckId : undefined,
      typingVariant:
        setupMode === "typing" ? setupTypingVariant : undefined
    });
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{formatFullDate(Date.now())}</p>
          <h1>今日记忆</h1>
        </div>
        <button type="button" className="icon-button" onClick={() => openSetup()}>
          <Play size={19} />
        </button>
      </header>

      <section className="dashboard-band" aria-label="今日学习数据">
        <MetricTile
          label="新卡"
          value={dashboard.newCount}
          note="今日上限"
          tone="blue"
        />
        <MetricTile
          label="待复习"
          value={dashboard.dueReview}
          note="到期卡片"
          tone="amber"
        />
        <MetricTile
          label="预计耗时"
          value={dashboard.estimatedMinutes}
          note="分钟"
          tone="green"
        />
      </section>

      <section className="task-banner">
        <div className="task-copy">
          <span className="task-kicker">
            <CalendarClock size={16} />
            今日队列
          </span>
          <strong>
            {dashboard.newCount + dashboard.dueReview > 0
              ? `${dashboard.newCount + dashboard.dueReview} 张卡片等待处理`
              : "今日任务已完成"}
          </strong>
          <p>
            {dashboard.newCount + dashboard.dueReview > 0
              ? "先处理到期复习，再进入今日新卡。"
              : "可以开始无序版加练，或录入新的材料。"}
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => openSetup()}
          disabled={!cards.length}
        >
          <Play size={17} fill="currentColor" />
          开始
        </button>
        <div
          className="task-progress"
          style={{ "--progress": `${dashboard.completion * 100}%` } as React.CSSProperties}
        />
      </section>

      <section className="content-section">
        <header className="section-heading">
          <div>
            <p className="eyebrow">项目</p>
            <h2>学习内容</h2>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => openEditor({ kind: "project" })}
          >
            <Plus size={16} />
            新建项目
          </button>
        </header>

        {!projects.length ? (
          <EmptyState
            title="还没有项目"
            description="先创建一个阅读、写作或口语项目。"
            action={
              <button
                type="button"
                className="secondary-button"
                onClick={() => openEditor({ kind: "project" })}
              >
                新建项目
              </button>
            }
          />
        ) : (
          <div className="project-list">
            {projects.map((project) => {
              const projectDecks = decks.filter(
                (deck) => deck.projectId === project.id
              );
              const deckIds = new Set(projectDecks.map((deck) => deck.id));
              const projectCards = cards.filter((card) =>
                deckIds.has(card.deckId)
              );
              const learned = projectCards.filter(
                (card) => card.reviewCount > 0
              ).length;
              const due = projectCards.filter(
                (card) =>
                  card.reviewCount > 0 && card.nextReviewAt <= Date.now()
              ).length;
              const ratio = projectCards.length
                ? learned / projectCards.length
                : 0;

              return (
                <article className="project-block" key={project.id}>
                  <header className="project-header">
                    <div className="project-title">
                      <span className="project-icon">
                        <FolderKanban size={18} />
                      </span>
                      <div>
                        <h3>{project.name}</h3>
                        <p>
                          {projectCards.length} 张 · {due} 张到期
                        </p>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button compact"
                        onClick={() =>
                          openEditor({ kind: "project", value: project })
                        }
                        aria-label={`重命名 ${project.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button compact danger"
                        onClick={async () => {
                          if (
                            window.confirm(
                              `删除项目“${project.name}”及其全部卡片？`
                            )
                          ) {
                            await deleteProject(project.id);
                          }
                        }}
                        aria-label={`删除 ${project.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </header>

                  <div className="project-progress" aria-label="学习进度">
                    <span style={{ width: `${ratio * 100}%` }} />
                  </div>

                  <div className="deck-list">
                    {projectDecks.map((deck) => {
                      const deckCards = cards.filter(
                        (card) => card.deckId === deck.id
                      );
                      const deckDue = deckCards.filter(
                        (card) =>
                          card.reviewCount > 0 &&
                          card.nextReviewAt <= Date.now()
                      ).length;
                      const deckNew = deckCards.filter(
                        (card) => card.reviewCount === 0
                      ).length;

                      return (
                        <div className="deck-row" key={deck.id}>
                          <button
                            type="button"
                            className="deck-main"
                            onClick={() => onOpenDeck(deck.id)}
                          >
                            <span>
                              <strong>{deck.name}</strong>
                              <small>
                                {deckNew} 新卡 · {deckDue} 待复习
                              </small>
                            </span>
                            <ChevronRight size={18} />
                          </button>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="icon-button compact primary"
                              onClick={() => openSetup(deck.id)}
                              aria-label={`开始复习 ${deck.name}`}
                              title="开始复习"
                            >
                              <Play size={14} fill="currentColor" />
                            </button>
                            <button
                              type="button"
                              className="icon-button compact"
                              onClick={() =>
                                openEditor({
                                  kind: "deck",
                                  projectId: project.id,
                                  value: deck
                                })
                              }
                              aria-label={`重命名 ${deck.name}`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-button compact danger"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    `删除卡组"${deck.name}"及其全部卡片？`
                                  )
                                ) {
                                  await deleteDeck(deck.id);
                                }
                              }}
                              aria-label={`删除 ${deck.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="add-deck-row"
                      onClick={() =>
                        openEditor({ kind: "deck", projectId: project.id })
                      }
                    >
                      <Plus size={16} />
                      新建卡组
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="quick-row">
        <div>
          <Clock3 size={18} />
          <span className="quick-label">无序加练</span>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSetupScope("random");
            setSetupMode("mixed");
            setSetupOpen(true);
          }}
          disabled={!cards.length}
        >
          自由练习
        </button>
      </section>

      <Modal
        open={editor !== null}
        title={
          editor?.kind === "deck"
            ? editor.value
              ? "重命名卡组"
              : "新建卡组"
            : editor?.value
              ? "重命名项目"
              : "新建项目"
        }
        onClose={() => setEditor(null)}
        actions={
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setEditor(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={saveEditor}
              disabled={!editorName.trim()}
            >
              保存
            </button>
          </>
        }
      >
        <label className="field">
          <span>{editor?.kind === "deck" ? "卡组名称" : "项目名称"}</span>
          <input
            autoFocus
            value={editorName}
            onChange={(event) => setEditorName(event.target.value)}
            placeholder={editor?.kind === "deck" ? "例如：雅思口语" : "例如：写作"}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void saveEditor();
              }
            }}
          />
        </label>
      </Modal>

      <Modal
        open={setupOpen}
        title="开始复习"
        onClose={() => setSetupOpen(false)}
        actions={
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setSetupOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={startReview}
              disabled={setupScope === "focused" && !setupDeckId}
            >
              进入队列
            </button>
          </>
        }
      >
        <div className="form-stack">
          <label className="field">
            <span>复习范围</span>
            <SegmentedControl
              value={setupScope}
              ariaLabel="复习范围"
              options={[
                { value: "focused", label: "专项训练" },
                { value: "random", label: "无序版" }
              ]}
              onChange={(value) => setSetupScope(value)}
            />
          </label>

          {setupScope === "focused" ? (
            <label className="field">
              <span>卡组</span>
              <select
                value={setupDeckId}
                onChange={(event) => setSetupDeckId(event.target.value)}
              >
                {decks.map((deck) => (
                  <option value={deck.id} key={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="form-note">
              从全部项目中随机抽卡。练习结果只记录历史，不修改正式复习计划。
            </p>
          )}

          <label className="field">
            <span>题型</span>
            <SegmentedControl
              value={setupMode}
              ariaLabel="题型"
              options={[
                { value: "mixed", label: "混合" },
                { value: "cloze", label: "挖空" },
                { value: "typing", label: "中→英" },
                { value: "choice", label: "选择" }
              ]}
              onChange={(value) => setSetupMode(value)}
            />
          </label>

          {setupMode === "typing" ? (
            <label className="field">
              <span>打字模式</span>
              <SegmentedControl
                value={setupTypingVariant}
                ariaLabel="打字模式"
                options={[
                  { value: "test", label: "测试版（无提示）" },
                  { value: "hint", label: "提示打字版" }
                ]}
                onChange={(value) => setSetupTypingVariant(value)}
              />
              <small className="field-note">
                {setupTypingVariant === "test"
                  ? "只显示中文释义，完全凭记忆默写英文。"
                  : "空格无提示，底部展示单词卡（单词+音标+释义），照着拼一遍熟悉拼写。"}
              </small>
            </label>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
