import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Check,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  X
} from "lucide-react";
import { REPLOOP_ORIGIN, supabase } from "./supabase";
import { PronounceRow } from "./PronounceRow";
import type { Card, Deck, DictionaryEntry, Project } from "./types";
import "./extension.css";

type Tab = "lookup" | "review" | "account";

interface LookupResult {
  english: string;
  chinese: string;
  phonetic: string;
  definition: string;
  pos: string;
  source: "dictionary" | "translation";
}

function detectContentType(value: string): Card["content_type"] {
  if (/[.!?。！？]$/.test(value.trim()) || value.trim().split(/\s+/).length >= 7) {
    return "sentence";
  }
  return value.includes(" ") ? "phrase" : "word";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "");
}

async function lookup(text: string): Promise<LookupResult> {
  const query = text.trim();
  try {
    const dictionary = await fetch(
      `${REPLOOP_ORIGIN}/api/dictionary?word=${encodeURIComponent(query)}`
    ).then((response) => response.json());

    if (dictionary.found && dictionary.entries?.[0]) {
      const entry = dictionary.entries[0] as DictionaryEntry;
      return {
        english: entry.word,
        chinese: entry.translation || entry.definition,
        phonetic: entry.phonetic,
        definition: entry.definition,
        pos: entry.pos,
        source: "dictionary"
      };
    }
  } catch {
    // Translation fallback below.
  }

  const response = await fetch(`${REPLOOP_ORIGIN}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: query })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "查询失败");
  }
  return {
    english: query,
    chinese: data.text,
    phonetic: "",
    definition: "",
    pos: "",
    source: "translation"
  };
}

function SidePanel() {
  const [tab, setTab] = useState<Tab>("lookup");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewResult, setReviewResult] = useState<"correct" | "wrong" | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const dueCount = dueCards.length;
  const currentReview = dueCards[reviewIndex];

  const loadData = async (nextUserId: string) => {
    const [projectResult, deckResult, cardResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,position")
        .eq("user_id", nextUserId)
        .order("position"),
      supabase
        .from("decks")
        .select("id,project_id,name,position")
        .eq("user_id", nextUserId)
        .order("position"),
      supabase
        .from("cards")
        .select("*")
        .eq("user_id", nextUserId)
        .lte("next_review_at", Date.now())
        .order("next_review_at")
        .limit(100)
    ]);

    setProjects((projectResult.data ?? []) as Project[]);
    setDecks((deckResult.data ?? []) as Deck[]);
    setDueCards((cardResult.data ?? []) as Card[]);
    setDeckId((current) => current || String(deckResult.data?.[0]?.id ?? ""));
  };

  const applySession = async (id: string | null) => {
    setUserId(id);
    if (id) {
      await loadData(id);
    }
  };

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user.id ?? null);
    });

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      const pending = changes.pendingSelection?.newValue;
      if (typeof pending === "string" && pending.trim()) {
        setQuery(pending.trim());
        setTab("lookup");
        void chrome.storage.local.remove("pendingSelection");
        void runLookup(pending.trim());
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    void chrome.storage.local.get("pendingSelection").then((stored) => {
      const pending = stored.pendingSelection;
      if (typeof pending === "string" && pending.trim()) {
        setQuery(pending.trim());
        void chrome.storage.local.remove("pendingSelection");
        void runLookup(pending.trim());
      }
    });

    return () => {
      data.subscription.unsubscribe();
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const runLookup = async (text = query) => {
    if (!text.trim()) {
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      setResult(await lookup(text));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const authenticate = async (register: boolean) => {
    setLoading(true);
    setMessage("");
    const response = register
      ? await supabase.auth.signUp({
          email: email.trim(),
          password
        })
      : await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
    if (response.error) {
      setMessage(response.error.message);
    } else if (register && !response.data.session) {
      setMessage("账号已创建，请直接在插件中登录。 ");
    }
    setLoading(false);
  };

  const addCard = async () => {
    if (!userId || !result || !deckId) {
      return;
    }
    setLoading(true);
    setMessage("");
    const now = Date.now();
    const { error } = await supabase.from("cards").insert({
      user_id: userId,
      id: `card_${crypto.randomUUID()}`,
      deck_id: deckId,
      content_type: detectContentType(result.english),
      english: result.english,
      chinese: result.chinese,
      target: result.english,
      sentence: "",
      sentence_translation: "",
      phonetic: result.phonetic,
      definition_en: result.definition,
      definition_zh: result.chinese,
      part_of_speech: result.pos,
      tags: [],
      source: result.source,
      level: 0,
      next_review_at: now,
      last_reviewed_at: null,
      review_count: 0,
      correct_count: 0,
      created_at: now,
      updated_at: now
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("已加入卡组");
      await loadData(userId);
    }
    setLoading(false);
  };

  const submitReview = async () => {
    if (!currentReview || !userId || !reviewAnswer.trim()) {
      return;
    }
    const correct =
      normalize(reviewAnswer) === normalize(currentReview.english);
    const now = Date.now();
    const rating = correct
      ? reviewAnswer.length <= 12
        ? "easy"
        : "good"
      : "forgot";
    const levelAfter = correct
      ? Math.min(6, currentReview.level + (rating === "easy" ? 2 : 1))
      : 0;
    const intervals = [
      10 * 60_000,
      24 * 60 * 60_000,
      2 * 24 * 60 * 60_000,
      4 * 24 * 60 * 60_000,
      7 * 24 * 60 * 60_000,
      15 * 24 * 60 * 60_000,
      30 * 24 * 60 * 60_000
    ];
    const nextReviewAt = now + intervals[levelAfter];
    const log = {
      id: `log_${crypto.randomUUID()}`,
      cardId: currentReview.id,
      mode: "typing",
      reviewScope: "focused",
      answer: reviewAnswer,
      correctAnswer: currentReview.english,
      isCorrect: correct,
      attempts: 1,
      systemRating: rating,
      userRating: rating,
      reactionTimeMs: 0,
      answerTimeMs: 0,
      totalTimeMs: 0,
      speedBand: "normal",
      levelBefore: currentReview.level,
      levelAfter,
      nextReviewAt,
      affectsSchedule: true,
      reviewedAt: now
    };
    const { error } = await supabase.rpc("apply_review_log", {
      p_log: log,
      p_affects_schedule: true
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setReviewResult(correct ? "correct" : "wrong");
    window.setTimeout(() => {
      setReviewResult(null);
      setReviewAnswer("");
      setReviewIndex((current) => current + 1);
    }, 900);
  };

  const currentProjectName = useMemo(() => {
    const deck = decks.find((item) => item.id === deckId);
    return projects.find((item) => item.id === deck?.project_id)?.name ?? "";
  }, [deckId, decks, projects]);

  if (!userId) {
    return (
      <main className="auth-page">
        <header>
          <strong>RepLoop</strong>
          <span>Search. Save. Remember.</span>
        </header>
        <h1>登录后开始查词</h1>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="邮箱"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="密码"
        />
        {message ? <p className="message error">{message}</p> : null}
        <button
          type="button"
          className="primary"
          disabled={loading}
          onClick={() => void authenticate(false)}
        >
          登录
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => void authenticate(true)}
        >
          创建账号
        </button>
      </main>
    );
  }

  return (
    <main className="panel">
      <header className="brand">
        <div>
          <strong>RepLoop</strong>
          <span>今日待复习 {dueCount}</span>
        </div>
        <button
          type="button"
          className="icon"
          onClick={async () => {
            await supabase.auth.signOut();
            setUserId(null);
          }}
          title="退出登录"
        >
          <LogOut size={17} />
        </button>
      </header>

      <nav>
        <button
          type="button"
          className={tab === "lookup" ? "active" : ""}
          onClick={() => setTab("lookup")}
        >
          <Search size={15} />查词
        </button>
        <button
          type="button"
          className={tab === "review" ? "active" : ""}
          onClick={() => setTab("review")}
        >
          <BookOpen size={15} />复习
        </button>
        <button
          type="button"
          className={tab === "account" ? "active" : ""}
          onClick={() => setTab("account")}
        >
          账户
        </button>
      </nav>

      {tab === "lookup" ? (
        <section className="lookup-page">
          <div className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runLookup();
                }
              }}
              placeholder="单词、词伙或句子"
            />
            <button
              type="button"
              className="icon strong"
              onClick={() => void runLookup()}
            >
              {loading ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Search size={17} />
              )}
            </button>
          </div>

          {message ? <p className="message">{message}</p> : null}

          {result ? (
            <article className="lookup-result">
              <small>
                {result.source === "dictionary" ? "词典结果" : "在线翻译"}
              </small>
              <h2>{result.english}</h2>
              <PronounceRow word={result.english} phonetic={result.phonetic} />
              <strong>{result.chinese}</strong>
              {result.definition ? <p>{result.definition}</p> : null}
              <select
                value={deckId}
                onChange={(event) => setDeckId(event.target.value)}
              >
                {projects.map((project) => (
                  <optgroup label={project.name} key={project.id}>
                    {decks
                      .filter((deck) => deck.project_id === project.id)
                      .map((deck) => (
                        <option value={deck.id} key={deck.id}>
                          {deck.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="primary"
                disabled={!deckId || loading}
                onClick={() => void addCard()}
              >
                <Plus size={16} />
                加入 {currentProjectName || "卡组"}
              </button>
            </article>
          ) : (
            <div className="empty">
              <p>选中网页文字，或在这里搜索。</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "review" ? (
        <section className="review-page">
          {currentReview ? (
            <>
              <small>中→英快速复习</small>
              <h2>{currentReview.chinese}</h2>
              <input
                value={reviewAnswer}
                disabled={reviewResult !== null}
                onChange={(event) => setReviewAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submitReview();
                  }
                }}
                placeholder="输入英文"
              />
              {reviewResult ? (
                <p
                  className={`message ${
                    reviewResult === "correct" ? "success" : "error"
                  }`}
                >
                  {reviewResult === "correct" ? (
                    <>
                      <Check size={15} /> 正确
                    </>
                  ) : (
                    <>
                      <X size={15} /> 正确答案：{currentReview.english}
                    </>
                  )}
                </p>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => void submitReview()}
                >
                  提交
                </button>
              )}
            </>
          ) : (
            <div className="empty">
              <strong>今日任务已完成</strong>
              <p>没有到期卡片。</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "account" ? (
        <section className="account-page">
          <p>当前账号已登录。</p>
          <p>数据通过 Supabase 与网站同步。</p>
          <a href={REPLOOP_ORIGIN} target="_blank" rel="noreferrer">
            打开完整 RepLoop 网站
          </a>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>
);
