import {
  BookCopy,
  Braces,
  Check,
  GraduationCap,
  LibraryBig,
  LoaderCircle,
  MessageSquareText,
  PenLine,
  Plus,
  Search
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { createCard, db } from "../lib/db";
import {
  detectContentType,
  lookupDictionary,
  translateText
} from "../lib/dictionary";
import type {
  Card,
  ContentType,
  Deck,
  Project
} from "../types";

interface SearchDraft {
  contentType: ContentType;
  english: string;
  chinese: string;
  phonetic: string;
  definitionEn: string;
  definitionZh: string;
  partOfSpeech: string;
  source: "dictionary" | "translation";
}

const futureCollections = [
  { title: "雅思", subtitle: "口语与高频词伙", icon: GraduationCap },
  { title: "托福", subtitle: "学术词汇", icon: LibraryBig },
  { title: "四六级", subtitle: "考试大纲词表", icon: BookCopy },
  { title: "口语话题", subtitle: "常见表达", icon: MessageSquareText },
  { title: "写作话题", subtitle: "观点与搭配", icon: PenLine },
  { title: "自定义模板", subtitle: "复用录入结构", icon: Braces }
];

export function DiscoverPage() {
  const projects =
    useLiveQuery(
      () => db.projects.orderBy("position").toArray(),
      [],
      [] as Project[]
    ) ?? [];
  const decks =
    useLiveQuery(() => db.decks.orderBy("position").toArray(), [], [] as Deck[]) ??
    [];
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Card[]) ?? [];
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [draft, setDraft] = useState<SearchDraft | null>(null);
  const [deckId, setDeckId] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const activeDeckId = deckId || decks[0]?.id || "";

  const existingCard = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (!normalized) {
      return null;
    }
    return (
      cards.find(
        (card) => card.english.trim().toLocaleLowerCase("en") === normalized
      ) ?? null
    );
  }, [cards, query]);

  const existingDeck = existingCard
    ? decks.find((deck) => deck.id === existingCard.deckId)
    : null;

  const search = async () => {
    const value = query.trim();
    if (!value) {
      return;
    }

    setSearching(true);
    setNotice("");
    setDraft(null);

    try {
      const contentType = detectContentType(value);
      const dictionary = await lookupDictionary(value);

      if (
        contentType !== "sentence" &&
        dictionary.found &&
        dictionary.entries[0]
      ) {
        const entry = dictionary.entries[0];
        setDraft({
          contentType,
          english: entry.word,
          chinese: entry.translation || entry.definition,
          phonetic: entry.phonetic,
          definitionEn: entry.definition,
          definitionZh: entry.translation,
          partOfSpeech: entry.pos,
          source: "dictionary"
        });
        return;
      }

      const translation = await translateText(value);
      setDraft({
        contentType,
        english: value,
        chinese: translation,
        phonetic: "",
        definitionEn: "",
        definitionZh: "",
        partOfSpeech: "",
        source: "translation"
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!draft || !activeDeckId || existingCard) {
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await createCard({
        deckId: activeDeckId,
        contentType: draft.contentType,
        english: draft.english,
        chinese: draft.chinese,
        target:
          draft.contentType === "sentence" && target.trim()
            ? target.trim()
            : draft.english,
        sentence: draft.contentType === "sentence" ? draft.english : "",
        sentenceTranslation:
          draft.contentType === "sentence" ? draft.chinese : "",
        phonetic: draft.phonetic,
        definitionEn: draft.definitionEn,
        definitionZh: draft.definitionZh,
        partOfSpeech: draft.partOfSpeech,
        tags: [],
        source: draft.source
      });
      setNotice(
        `已加入“${decks.find((deck) => deck.id === activeDeckId)?.name ?? "卡组"}”`
      );
      setQuery("");
      setTarget("");
      setDraft(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加入卡组失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">搜索与模板</p>
          <h1>发现</h1>
        </div>
      </header>

      <section className="search-panel">
        <div className="search-intro">
          <span className="discover-mark">
            <Search size={22} />
          </span>
          <div>
            <h2>搜完就直接入库</h2>
            <p>单词优先查离线词典，词伙和句子调用在线直译。</p>
          </div>
        </div>

        <div className="search-input-row">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setNotice("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void search();
              }
            }}
            placeholder="搜索单词、词伙或英文句子"
          />
          <button
            type="button"
            className="primary-button"
            disabled={searching || !query.trim()}
            onClick={() => void search()}
          >
            {searching ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              "搜索"
            )}
          </button>
        </div>

        {notice ? <div className="notice-banner">{notice}</div> : null}

        {existingCard ? (
          <div className="existing-card">
            <span className="existing-icon">
              <Check size={18} />
            </span>
            <div>
              <strong>已经在词库中</strong>
              <p>
                “{existingCard.english}”位于
                {existingDeck?.name ?? "未知卡组"} · L{existingCard.level}
              </p>
            </div>
          </div>
        ) : null}

        {draft && !existingCard ? (
          <div className="search-result">
            <header>
              <div>
                <span className="part-of-speech">
                  {draft.source === "dictionary" ? "词典结果" : "在线直译"}
                </span>
                <h3>{draft.english}</h3>
                {draft.phonetic ? <small>/{draft.phonetic}/</small> : null}
              </div>
            </header>

            <dl>
              <div>
                <dt>中文</dt>
                <dd>{draft.chinese}</dd>
              </div>
              {draft.definitionEn ? (
                <div>
                  <dt>English</dt>
                  <dd>{draft.definitionEn}</dd>
                </div>
              ) : null}
            </dl>

            {draft.contentType === "sentence" ? (
              <label className="field">
                <span>挖空目标（可选）</span>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="句子中需要隐藏的单词或词伙"
                />
              </label>
            ) : null}

            <label className="field">
              <span>加入卡组</span>
              <select
                value={activeDeckId}
                onChange={(event) => setDeckId(event.target.value)}
              >
                {projects.map((project) => (
                  <optgroup label={project.name} key={project.id}>
                    {decks
                      .filter((deck) => deck.projectId === project.id)
                      .map((deck) => (
                        <option value={deck.id} key={deck.id}>
                          {deck.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="primary-button wide"
              disabled={saving || !activeDeckId}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Plus size={17} />
              )}
              加入卡组
            </button>
          </div>
        ) : null}
      </section>

      <section className="content-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">后续内容</p>
            <h2>公开词库与模板</h2>
          </div>
        </header>
        {!projects.length ? (
          <EmptyState
            title="还没有可加入的项目"
            description="先在首页创建项目与卡组，搜索结果才有地方保存。"
          />
        ) : (
          <div className="collection-grid">
            {futureCollections.map((item) => (
              <article className="collection-tile" key={item.title}>
                <item.icon size={20} />
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
                <small>待开放</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
