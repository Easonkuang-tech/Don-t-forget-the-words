import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  RotateCcw,
  X
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { MemoryMeter } from "../components/MemoryMeter";
import { matchEnglishAnswer } from "../lib/answer";
import { createCardLog, db } from "../lib/db";
import {
  calculateSchedule,
  suggestRating
} from "../lib/scheduler";
import { buildReviewQuestions, shuffle } from "../lib/review";
import {
  formatDuration,
  formatRelativeDue,
  modeLabel,
  ratingLabel
} from "../lib/format";
import { useResponseTimer } from "../hooks/useResponseTimer";
import type {
  Card,
  Rating,
  ReviewLog,
  ReviewQuestion,
  ReviewSessionRequest
} from "../types";

interface ReviewPageProps {
  request: ReviewSessionRequest;
  onExit: () => void;
}

interface PendingResult {
  answer: string;
  correct: boolean;
  suggestedRating: Rating;
  totalTimeMs: number;
  reactionTimeMs: number;
  answerTimeMs: number;
}

const ratingOrder: Rating[] = ["forgot", "hard", "good", "easy"];

export function ReviewPage({ request, onExit }: ReviewPageProps) {
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Card[]) ?? [];
  const settings = useLiveQuery(() => db.settings.get("app"));
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [clozeOpen, setClozeOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hintTyped, setHintTyped] = useState("");
  const [result, setResult] = useState<PendingResult | null>(null);
  const [summary, setSummary] = useState({
    completed: 0,
    correct: 0,
    duration: 0
  });
  const firstInputAtRef = useRef<number | null>(null);
  const hintInputRef = useRef<HTMLInputElement | null>(null);
  const sessionKey = `${request.scope}:${request.mode}:${request.deckId ?? "all"}`;
  const builtKeyRef = useRef("");

  const question = questions[index];
  const timer = useResponseTimer(Boolean(question) && !result, question?.id ?? "idle");

  const isHintTyping =
    request.mode === "typing" && request.typingVariant === "hint";

  const hintSlots = useMemo(() => {
    if (!question || question.mode !== "typing" || !isHintTyping) {
      return null;
    }
    return Array.from(question.card.english).map((char) => ({
      char,
      isLetter: /\p{L}/u.test(char)
    }));
  }, [question, isHintTyping]);

  const hintLetterCount = hintSlots
    ? hintSlots.filter((slot) => slot.isLetter).length
    : 0;
  const hintFallback = hintLetterCount > 32;
  const hintAnswer = useMemo(() => {
    if (!hintSlots) {
      return "";
    }
    let letterOrdinal = 0;
    return hintSlots
      .map((slot) => {
        if (!slot.isLetter) {
          return slot.char;
        }
        const char = hintTyped[letterOrdinal] ?? "";
        letterOrdinal += 1;
        return char;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }, [hintSlots, hintTyped]);
  const hintComplete =
    hintLetterCount > 0 && hintTyped.length === hintLetterCount;

  useEffect(() => {
    if (builtKeyRef.current === sessionKey || !settings) {
      return;
    }

    let candidateCards = [...cards];
    if (request.scope === "focused") {
      candidateCards = candidateCards.filter(
        (card) => !request.deckId || card.deckId === request.deckId
      );
      const now = Date.now();
      const due = candidateCards
        .filter(
          (card) => card.reviewCount > 0 && card.nextReviewAt <= now
        )
        .sort((left, right) => left.nextReviewAt - right.nextReviewAt);
      const fresh = candidateCards
        .filter((card) => card.reviewCount === 0)
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(0, settings.dailyNewLimit);
      candidateCards = [...due, ...fresh];
    } else {
      candidateCards = shuffle(candidateCards);
    }

    builtKeyRef.current = sessionKey;
    setQuestions(
      buildReviewQuestions(
        candidateCards,
        cards,
        request.mode,
        Math.random
      )
    );
  }, [cards, request.deckId, request.mode, request.scope, sessionKey, settings]);

  useEffect(() => {
    setAnswer("");
    setClozeOpen(false);
    setSelectedOption(null);
    setHintTyped("");
    setResult(null);
    firstInputAtRef.current = null;
  }, [question?.id]);

  const commitReview = async (userRating: Rating) => {
    if (!question || !result) {
      return;
    }

    const now = Date.now();
    const schedule = calculateSchedule({
      card: question.card,
      performance: {
        isCorrect: result.correct,
        attempts: 1,
        mode: question.mode,
        elapsedMilliseconds: result.totalTimeMs
      },
      userRating,
      now
    });
    const affectsSchedule = request.scope === "focused";

    const log: ReviewLog = {
      id: `log_${crypto.randomUUID()}`,
      cardId: question.card.id,
      mode: question.mode,
      reviewScope: request.scope,
      answer: result.answer,
      correctAnswer:
        question.mode === "choice"
          ? question.options[question.correctOptionIndex]
          : question.mode === "cloze"
            ? question.cloze?.target ?? question.card.target
            : question.card.chinese,
      isCorrect: result.correct,
      attempts: 1,
      systemRating: result.suggestedRating,
      userRating,
      reactionTimeMs: result.reactionTimeMs,
      answerTimeMs: result.answerTimeMs,
      totalTimeMs: result.totalTimeMs,
      speedBand: schedule.speedBand,
      levelBefore: schedule.levelBefore,
      levelAfter: affectsSchedule
        ? schedule.levelAfter
        : question.card.level,
      nextReviewAt: affectsSchedule
        ? schedule.nextReviewAt
        : question.card.nextReviewAt,
      affectsSchedule,
      reviewedAt: now
    };

    await createCardLog(log, affectsSchedule);
    setSummary((current) => ({
      completed: current.completed + 1,
      correct: current.correct + (result.correct ? 1 : 0),
      duration: current.duration + result.totalTimeMs
    }));

    if (index + 1 >= questions.length) {
      setIndex(questions.length);
    } else {
      setIndex((current) => current + 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!result) {
        return;
      }
      const ratingIndex = Number(event.key) - 1;
      const rating = ratingOrder[ratingIndex];
      if (rating) {
        event.preventDefault();
        void commitReview(rating);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const submitAnswer = (value: string, selectedIndex: number | null = null) => {
    if (!question || result) {
      return;
    }
    const totalTimeMs = timer.getElapsed();
    const reactionTimeMs = firstInputAtRef.current ?? totalTimeMs;
    const answerTimeMs = Math.max(0, totalTimeMs - reactionTimeMs);
    let correct = false;

    if (question.mode === "choice") {
      correct = selectedIndex === question.correctOptionIndex;
    } else if (question.mode === "cloze") {
      correct = matchEnglishAnswer(
        value,
        question.cloze?.target ?? question.card.target
      );
    } else {
      correct = matchEnglishAnswer(value, question.card.english);
    }

    const suggestedRating = suggestRating({
      isCorrect: correct,
      attempts: 1,
      mode: question.mode,
      elapsedMilliseconds: totalTimeMs
    });

    const effectiveRating =
      isHintTyping &&
      question.mode === "typing" &&
      correct &&
      (suggestedRating === "good" || suggestedRating === "easy")
        ? ("hard" as Rating)
        : suggestedRating;

    setSelectedOption(selectedIndex);
    setResult({
      answer: value,
      correct,
      suggestedRating: effectiveRating,
      totalTimeMs,
      reactionTimeMs,
      answerTimeMs
    });
  };

  if (!questions.length && builtKeyRef.current === sessionKey) {
    return (
      <div className="review-page">
        <ReviewHeader
          request={request}
          current={0}
          total={0}
          onExit={onExit}
        />
        <EmptyState
          title={
            request.scope === "focused"
              ? "当前没有到期卡片"
              : "词库还是空的"
          }
          description={
            request.scope === "focused"
              ? "可以继续录入新内容，或使用无序版加练。"
              : "先去创建卡片，再开始自由练习。"
          }
          action={
            <button type="button" className="secondary-button" onClick={onExit}>
              返回首页
            </button>
          }
        />
      </div>
    );
  }

  if (!question) {
    const accuracy = summary.completed
      ? Math.round((summary.correct / summary.completed) * 100)
      : 0;

    return (
      <div className="review-page">
        <header className="review-topbar">
          <button type="button" className="icon-button" onClick={onExit}>
            <ArrowLeft size={19} />
          </button>
          <span>本轮完成</span>
          <span />
        </header>
        <section className="session-summary">
          <div className="summary-mark">
            <Check size={28} />
          </div>
          <p className="eyebrow">练习记录</p>
          <h1>这一轮结束了</h1>
          <div className="summary-grid">
            <div>
              <strong>{summary.completed}</strong>
              <span>完成卡片</span>
            </div>
            <div>
              <strong>{accuracy}%</strong>
              <span>首次正确率</span>
            </div>
            <div>
              <strong>{formatDuration(summary.duration)}</strong>
              <span>总用时</span>
            </div>
          </div>
          <button type="button" className="primary-button wide" onClick={onExit}>
            返回首页
          </button>
        </section>
      </div>
    );
  }

  const correctAnswer =
    question.mode === "choice"
      ? question.options[question.correctOptionIndex]
      : question.mode === "cloze"
        ? question.cloze?.target ?? question.card.target
        : question.mode === "typing"
          ? question.card.english
          : question.card.chinese;

  const markFirstInput = () => {
    if (firstInputAtRef.current === null) {
      firstInputAtRef.current = timer.getElapsed();
    }
  };

  return (
    <div className="review-page">
      <ReviewHeader
        request={request}
        current={index + 1}
        total={questions.length}
        onExit={onExit}
      />

      <section className="study-card">
        <header className="study-card-header">
          <div>
            <span className="mode-chip">{modeLabel(question.mode)}</span>
            {request.scope === "random" ? (
              <span className="practice-chip">不计入计划</span>
            ) : null}
          </div>
          <MemoryMeter level={question.card.level} />
        </header>

        <div className="question-upper">
          {question.mode === "cloze" && question.cloze ? (
            <div className="cloze-sentence">
              <span>{question.cloze.before}</span>
              {clozeOpen && !result ? (
                <input
                  autoFocus
                  className="cloze-input"
                  value={answer}
                  onChange={(event) => {
                    markFirstInput();
                    setAnswer(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && answer.trim()) {
                      submitAnswer(answer);
                    }
                  }}
                  aria-label="填写缺失的英文"
                  size={Math.max(7, question.cloze.target.length)}
                />
              ) : (
                <button
                  type="button"
                  className="cloze-blank"
                  onClick={() => {
                    if (!result) {
                      setClozeOpen(true);
                    }
                  }}
                  disabled={Boolean(result)}
                >
                  {result
                    ? question.cloze.target
                    : "点击填写"}
                </button>
              )}
              <span>{question.cloze.after}</span>
            </div>
          ) : question.mode === "typing" ? (
            <div className="chinese-prompt">
              <span className="prompt-kind">中文释义</span>
              <h1>{question.card.chinese}</h1>
            </div>
          ) : (
            <div className="english-prompt">
              <span className="prompt-kind">
                {question.card.contentType === "sentence"
                  ? "英文句子"
                  : question.card.contentType === "phrase"
                    ? "英文词伙"
                    : "英文单词"}
              </span>
              <h1>{question.card.english}</h1>
              {question.card.phonetic ? (
                <p className="phonetic">/{question.card.phonetic}/</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="question-lower">
          {question.mode === "cloze" && question.card.sentenceTranslation ? (
            <div className="translation-hint">
              <span>中文提示</span>
              <p>{question.card.sentenceTranslation}</p>
            </div>
          ) : null}

          {question.mode === "typing" && isHintTyping && !hintFallback && hintSlots ? (
            <div className="hint-typing">
              <div className="hint-typing-meta">
                <span>{hintLetterCount} 个字母 · 照着下方单词卡拼写</span>
              </div>
              <input
                ref={hintInputRef}
                className="hint-typing-input"
                type="text"
                value={hintTyped}
                disabled={Boolean(result)}
                lang="en"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="逐字母输入英文"
                onChange={(event) => {
                  markFirstInput();
                  const letters = Array.from(event.target.value)
                    .filter((char) => /\p{L}/u.test(char))
                    .map((char) => char.toLowerCase())
                    .slice(0, hintLetterCount);
                  setHintTyped(letters.join(""));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && hintComplete) {
                    submitAnswer(hintAnswer);
                  }
                }}
              />
              <div
                className="hint-typing-grid"
                role="presentation"
                onClick={() => {
                  if (!result) {
                    hintInputRef.current?.focus();
                  }
                }}
              >
                {(() => {
                  let letterOrdinal = 0;
                  return hintSlots.map((slot, slotIndex) => {
                    if (!slot.isLetter) {
                      return (
                        <span
                          key={`sep-${slotIndex}`}
                          className={`hint-sep ${slot.char === " " ? "is-space" : ""}`}
                        >
                          {slot.char === " " ? "·" : slot.char}
                        </span>
                      );
                    }
                    const ordinal = letterOrdinal;
                    letterOrdinal += 1;
                    const typedChar = hintTyped[ordinal] ?? "";
                    return (
                      <span
                        key={`cell-${slotIndex}`}
                        className={`hint-cell ${typedChar ? "is-filled" : ""}`}
                      >
                        {typedChar}
                      </span>
                    );
                  });
                })()}
              </div>
              <div className="hint-typing-info">
                <p className="hint-word">
                  {question.card.english}
                  {question.card.phonetic ? (
                    <span className="hint-phonetic">
                      {" "}
                      /{question.card.phonetic}/
                    </span>
                  ) : null}
                </p>
                <p className="hint-meaning">
                  {question.card.definitionZh ||
                    question.card.definitionEn ||
                    question.card.chinese}
                </p>
              </div>
            </div>
          ) : question.mode === "typing" ? (
            <div className="typing-answer">
              <label htmlFor="meaning-answer">
                {isHintTyping
                  ? "默写对应的英文（内容较长，使用普通输入）"
                  : "默写对应的英文"}
              </label>
              <input
                id="meaning-answer"
                value={answer}
                disabled={Boolean(result)}
                lang="en"
                spellCheck={false}
                autoCapitalize="none"
                onChange={(event) => {
                  markFirstInput();
                  setAnswer(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && answer.trim()) {
                    submitAnswer(answer);
                  }
                }}
                placeholder="输入英文单词或词伙"
              />
            </div>
          ) : null}

          {question.mode === "choice" ? (
            <div className="choice-grid">
              {question.options.map((option, optionIndex) => {
                const isCorrect =
                  Boolean(result) && optionIndex === question.correctOptionIndex;
                const isWrong =
                  Boolean(result) &&
                  optionIndex === selectedOption &&
                  optionIndex !== question.correctOptionIndex;
                return (
                  <button
                    type="button"
                    key={`${option}-${optionIndex}`}
                    className={`choice-option ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}
                    disabled={Boolean(result)}
                    onClick={() => {
                      markFirstInput();
                      setAnswer(option);
                      submitAnswer(option, optionIndex);
                    }}
                  >
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    <strong>{option}</strong>
                    {isCorrect ? <Check size={18} /> : null}
                    {isWrong ? <X size={18} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {question.mode !== "choice" && !result ? (
            <button
              type="button"
              className="primary-button wide submit-answer"
              disabled={
                !answer.trim() ||
                (question.mode === "cloze" && !clozeOpen) ||
                (question.mode === "typing" &&
                  isHintTyping &&
                  !hintFallback &&
                  !hintComplete)
              }
              onClick={() =>
                submitAnswer(
                  question.mode === "typing" &&
                    isHintTyping &&
                    !hintFallback
                    ? hintAnswer
                    : answer
                )
              }
            >
              提交答案
              <ChevronRight size={17} />
            </button>
          ) : null}
        </div>
      </section>

      {result ? (
        <section
          className={`answer-feedback ${result.correct ? "is-correct" : "is-wrong"}`}
        >
          <header>
            <span className="feedback-icon">
              {result.correct ? <Check size={19} /> : <X size={19} />}
            </span>
            <div>
              <h2>{result.correct ? "回答正确" : "再记一次"}</h2>
              <p>
                用时 {formatDuration(result.totalTimeMs)} · 系统建议
                {ratingLabel(result.suggestedRating)}
              </p>
            </div>
          </header>

          <div className="answer-comparison">
            <div>
              <span>你的答案</span>
              <strong>{result.answer || "未作答"}</strong>
            </div>
            <div>
              <span>正确答案</span>
              <strong>{correctAnswer}</strong>
            </div>
          </div>

          {question.mode === "cloze" && question.card.sentenceTranslation ? (
            <div className="translation-hint compact">
              <span>完整句意</span>
              <p>{question.card.sentenceTranslation}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="rating-dock" aria-label="记忆评级">
        {ratingOrder.map((rating, ratingIndex) => {
          const preview = calculateSchedule({
            card: question.card,
            performance: {
              isCorrect: result?.correct ?? false,
              attempts: 1,
              mode: question.mode,
              elapsedMilliseconds: result?.totalTimeMs ?? timer.elapsed
            },
            userRating: rating,
            now: Date.now()
          });
          const recommended = result?.suggestedRating === rating;
          return (
            <button
              type="button"
              key={rating}
              className={`rating-button rating-${rating} ${recommended ? "is-recommended" : ""}`}
              disabled={!result}
              onClick={() => void commitReview(rating)}
              title={`快捷键 ${ratingIndex + 1}`}
            >
              <span>{ratingLabel(rating)}</span>
              <small>
                {request.scope === "random"
                  ? "仅记录"
                  : formatRelativeDue(preview.nextReviewAt)}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewHeader({
  request,
  current,
  total,
  onExit
}: {
  request: ReviewSessionRequest;
  current: number;
  total: number;
  onExit: () => void;
}) {
  const progress = total ? (current / total) * 100 : 0;
  return (
    <header className="review-topbar">
      <button type="button" className="icon-button" onClick={onExit}>
        <ArrowLeft size={19} />
      </button>
      <div className="review-progress">
        <div>
          <span>{request.scope === "focused" ? "专项训练" : "无序版"}</span>
          <strong>
            {current} / {total}
          </strong>
        </div>
        <div className="review-progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <CircleHelp size={19} className="topbar-hint" />
    </header>
  );
}
