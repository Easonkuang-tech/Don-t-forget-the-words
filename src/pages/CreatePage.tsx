import {
  BookOpenCheck,
  FileText,
  LoaderCircle,
  Search,
  Sparkles,
  Upload
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PronounceRow } from "../components/PronounceRow";
import { SegmentedControl } from "../components/SegmentedControl";
import { createCard, db } from "../lib/db";
import {
  detectContentType,
  firstMeaning,
  lookupDictionary,
  translateText
} from "../lib/dictionary";
import type {
  ContentType,
  Deck,
  DictionaryEntry,
  DictionaryLookupResult,
  Project
} from "../types";

type CreateMode = "word" | "template" | "direct";

interface DraftCard {
  contentType: ContentType;
  english: string;
  chinese: string;
  target: string;
  sentence: string;
  sentenceTranslation: string;
  phonetic: string;
  definitionEn: string;
  definitionZh: string;
  partOfSpeech: string;
  tags: string[];
  source: "manual" | "template" | "dictionary" | "translation";
}

const emptyDraft: DraftCard = {
  contentType: "word",
  english: "",
  chinese: "",
  target: "",
  sentence: "",
  sentenceTranslation: "",
  phonetic: "",
  definitionEn: "",
  definitionZh: "",
  partOfSpeech: "",
  tags: [],
  source: "manual"
};

export function CreatePage() {
  const projects =
    useLiveQuery(
      () => db.projects.orderBy("position").toArray(),
      [],
      [] as Project[]
    ) ?? [];
  const decks =
    useLiveQuery(() => db.decks.orderBy("position").toArray(), [], [] as Deck[]) ??
    [];
  const [mode, setMode] = useState<CreateMode>("word");
  const [deckId, setDeckId] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const activeDeckId = deckId || decks[0]?.id || "";

  if (!decks.length) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div>
            <p className="eyebrow">录入</p>
            <h1>创建卡片</h1>
          </div>
        </header>
        <EmptyState
          title="先创建一个卡组"
          description="卡片需要放进项目中的卡组。请先回到首页创建项目和卡组。"
        />
      </div>
    );
  }

  const saveDraft = async (draft: DraftCard) => {
    if (!draft.english.trim()) {
      setNotice("英文内容不能为空");
      return;
    }
    if (!draft.chinese.trim()) {
      setNotice("还没有可保存的中文释义");
      return;
    }

    setSaving(true);
    try {
      await createCard({
        deckId: activeDeckId,
        contentType: draft.contentType,
        english: draft.english.trim(),
        chinese: draft.chinese.trim(),
        target: draft.target.trim(),
        sentence: draft.sentence.trim(),
        sentenceTranslation: draft.sentenceTranslation.trim(),
        phonetic: draft.phonetic.trim(),
        definitionEn: draft.definitionEn.trim(),
        definitionZh: draft.definitionZh.trim(),
        partOfSpeech: draft.partOfSpeech.trim(),
        tags: draft.tags,
        source: draft.source
      });
      setNotice("卡片已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">录入</p>
          <h1>创建卡片</h1>
        </div>
      </header>

      <SegmentedControl
        value={mode}
        ariaLabel="录入方式"
        options={[
          { value: "word", label: "单词查词" },
          { value: "template", label: "模板批量" },
          { value: "direct", label: "英文直查" }
        ]}
        onChange={(value) => {
          setMode(value);
          setNotice("");
        }}
      />

      <label className="field">
        <span>保存到卡组</span>
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

      {notice ? <div className="notice-banner">{notice}</div> : null}

      {mode === "word" ? (
        <WordCapture
          saving={saving}
          onSave={(draft) => void saveDraft(draft)}
        />
      ) : null}

      {mode === "template" ? (
        <TemplateCapture
          saving={saving}
          onSave={async (drafts) => {
            if (!drafts.length) {
              setNotice("没有解析到有效词条");
              return;
            }
            setSaving(true);
            try {
              for (const draft of drafts) {
                await createCard({
                  deckId: activeDeckId,
                  contentType: draft.contentType,
                  english: draft.english.trim(),
                  chinese: draft.chinese.trim(),
                  target: draft.target.trim(),
                  sentence: draft.sentence.trim(),
                  sentenceTranslation: draft.sentenceTranslation.trim(),
                  phonetic: draft.phonetic.trim(),
                  definitionEn: draft.definitionEn.trim(),
                  definitionZh: draft.definitionZh.trim(),
                  partOfSpeech: draft.partOfSpeech.trim(),
                  tags: draft.tags,
                  source: "template"
                });
              }
              setNotice(`已保存 ${drafts.length} 张卡片`);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "批量保存失败");
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {mode === "direct" ? (
        <DirectCapture
          saving={saving}
          onSave={(draft) => void saveDraft(draft)}
        />
      ) : null}
    </div>
  );
}

function WordCapture({
  saving,
  onSave
}: {
  saving: boolean;
  onSave: (draft: DraftCard) => void;
}) {
  const [word, setWord] = useState("");
  const [result, setResult] = useState<DictionaryLookupResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sentence, setSentence] = useState("");
  const [sentenceTranslation, setSentenceTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = word.trim();
    if (!trimmed || trimmed.includes(" ")) {
      setResult(null);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const lookup = await lookupDictionary(trimmed);
        if (active) {
          setResult(lookup);
          setSelectedIndex(0);
        }
      } catch (lookupError) {
        if (active) {
          setError(
            lookupError instanceof Error ? lookupError.message : "查询失败"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [word]);

  const entry = result?.entries[selectedIndex];
  const draft = useMemo<DraftCard | null>(() => {
    if (!entry) {
      return null;
    }
    return {
      ...emptyDraft,
      contentType: "word",
      english: entry.word,
      chinese: entry.translation || entry.definition,
      target: entry.word,
      sentence,
      sentenceTranslation,
      phonetic: entry.phonetic,
      definitionEn: entry.definition,
      definitionZh: entry.translation,
      partOfSpeech: entry.pos,
      source: "dictionary"
    };
  }, [entry, sentence, sentenceTranslation]);

  return (
    <section className="capture-panel">
      <div className="capture-title">
        <Search size={19} />
        <div>
          <h2>输入一个英文单词</h2>
          <p>系统会从本地 ECDICT 自动补全音标和释义。</p>
        </div>
      </div>

      <label className="field">
        <span>英文单词</span>
        <div className="input-with-status">
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="例如：consider"
            spellCheck={false}
          />
          {loading ? <LoaderCircle className="spin" size={18} /> : null}
        </div>
      </label>

      {error ? <div className="inline-error">{error}</div> : null}

      {result && !result.found && word.trim() ? (
        <div className="inline-warning">
          本地词典没有找到“{word.trim()}”。可以改用模板或英文直查。
        </div>
      ) : null}

      {entry ? (
        <>
          {result.entries.length > 1 ? (
            <label className="field">
              <span>匹配词条</span>
              <select
                value={selectedIndex}
                onChange={(event) =>
                  setSelectedIndex(Number(event.target.value))
                }
              >
                {result.entries.map((item, index) => (
                  <option value={index} key={`${item.word}-${index}`}>
                    {item.word} · {firstMeaning(item)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <DictionaryCard entry={entry} />

          <label className="field">
            <span>例句（用于挖空题型，可选）</span>
            <textarea
              value={sentence}
              onChange={(event) => setSentence(event.target.value)}
              placeholder={`请输入包含 ${entry.word} 的完整句子`}
            />
          </label>

          {sentence.trim() ? (
            <button
              type="button"
              className="secondary-button"
              disabled={translating}
              onClick={async () => {
                setTranslating(true);
                setError("");
                try {
                  setSentenceTranslation(await translateText(sentence.trim()));
                } catch (translationError) {
                  setError(
                    translationError instanceof Error
                      ? translationError.message
                      : "翻译失败"
                  );
                } finally {
                  setTranslating(false);
                }
              }}
            >
              {translating ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              获取例句直译
            </button>
          ) : null}

          {sentenceTranslation ? (
            <div className="translation-preview">
              <span>例句中文</span>
              <p>{sentenceTranslation}</p>
            </div>
          ) : null}

          <button
            type="button"
            className="primary-button wide"
            disabled={saving || !draft}
            onClick={() => draft && onSave(draft)}
          >
            保存单词卡片
          </button>
        </>
      ) : null}
    </section>
  );
}

function DictionaryCard({ entry }: { entry: DictionaryEntry }) {
  return (
    <div className="dictionary-card">
      <div className="dictionary-word">
        <strong>{entry.word}</strong>
      </div>
      <PronounceRow word={entry.word} fallbackPhonetic={entry.phonetic} />
      {entry.pos ? <span className="part-of-speech">{entry.pos}</span> : null}
      <dl>
        <div>
          <dt>中文</dt>
          <dd>{entry.translation || "暂无中文释义"}</dd>
        </div>
        {entry.definition ? (
          <div>
            <dt>English</dt>
            <dd>{entry.definition}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function TemplateCapture({
  saving,
  onSave
}: {
  saving: boolean;
  onSave: (drafts: DraftCard[]) => Promise<void>;
}) {
  const [topicName, setTopicName] = useState("新专题");
  const [contentType, setContentType] = useState<ContentType>("phrase");
  const [blockType, setBlockType] = useState("默认区块");
  const [text, setText] = useState("");

  const parsed = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.includes("|") ? "|" : "｜";
        const [english, ...rest] = line.split(separator);
        return {
          english: english?.trim() ?? "",
          chinese: rest.join(separator).trim()
        };
      })
      .filter((item) => item.english && item.chinese);
  }, [text]);

  return (
    <section className="capture-panel">
      <div className="capture-title">
        <FileText size={19} />
        <div>
          <h2>模板批量录入</h2>
          <p>每行使用“英文 | 中文”，适合粘贴现有材料。</p>
        </div>
      </div>

      <div className="two-column-fields">
        <label className="field">
          <span>专题名称</span>
          <input
            value={topicName}
            onChange={(event) => setTopicName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>内容类型</span>
          <select
            value={contentType}
            onChange={(event) =>
              setContentType(event.target.value as ContentType)
            }
          >
            <option value="word">单词</option>
            <option value="phrase">词伙</option>
            <option value="sentence">句子</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>区块类型</span>
        <input
          value={blockType}
          onChange={(event) => setBlockType(event.target.value)}
          placeholder="例如：生肉版 1"
        />
      </label>

      <label className="field">
        <span>批量内容</span>
        <textarea
          className="template-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Make the right call | 做出正确判断\nCash out a customer | 给顾客结账`}
        />
      </label>

      <div className="parse-summary">
        <span>已识别 {parsed.length} 条</span>
        <span>{text.split(/\r?\n/).filter(Boolean).length - parsed.length} 条格式错误</span>
      </div>

      {parsed.length ? (
        <div className="template-preview">
          {parsed.slice(0, 5).map((item, index) => (
            <div key={`${item.english}-${index}`}>
              <strong>{item.english}</strong>
              <span>{item.chinese}</span>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="primary-button wide"
        disabled={saving || !parsed.length}
        onClick={() =>
          void onSave(
            parsed.map((item) => ({
              ...emptyDraft,
              contentType,
              english: item.english,
              chinese: item.chinese,
              tags: [topicName, blockType].filter(Boolean),
              source: "template"
            }))
          )
        }
      >
        <Upload size={17} />
        保存 {parsed.length} 张卡片
      </button>
    </section>
  );
}

function DirectCapture({
  saving,
  onSave
}: {
  saving: boolean;
  onSave: (draft: DraftCard) => void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [draft, setDraft] = useState<DraftCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const english = text.trim();
    if (!english) {
      return;
    }

    setLoading(true);
    setError("");
    setDraft(null);

    try {
      const contentType = detectContentType(english);
      const lookup = await lookupDictionary(english);

      if (contentType !== "sentence" && lookup.found && lookup.entries[0]) {
        const entry = lookup.entries[0];
        setDraft({
          ...emptyDraft,
          contentType,
          english: entry.word,
          chinese: entry.translation || entry.definition,
          target: entry.word,
          phonetic: entry.phonetic,
          definitionEn: entry.definition,
          definitionZh: entry.translation,
          partOfSpeech: entry.pos,
          source: "dictionary"
        });
        return;
      }

      const translation = await translateText(english);
      setDraft({
        ...emptyDraft,
        contentType,
        english,
        chinese: translation,
        target: contentType === "sentence" ? target.trim() : english,
        sentence: contentType === "sentence" ? english : "",
        sentenceTranslation: contentType === "sentence" ? translation : "",
        source: "translation"
      });
    } catch (lookupError) {
      setError(
        lookupError instanceof Error ? lookupError.message : "查询或翻译失败"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="capture-panel">
      <div className="capture-title">
        <BookOpenCheck size={19} />
        <div>
          <h2>输入英文直接查询</h2>
          <p>单词优先查词典；词伙和句子调用在线直译。</p>
        </div>
      </div>

      <label className="field">
        <span>英文内容</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="单词、词伙或完整句子"
        />
      </label>

      {detectContentType(text) === "sentence" ? (
        <label className="field">
          <span>挖空目标（可选）</span>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="输入句子中需要隐藏的单词或词伙"
          />
        </label>
      ) : null}

      {error ? <div className="inline-error">{error}</div> : null}

      <button
        type="button"
        className="primary-button wide"
        disabled={loading || !text.trim()}
        onClick={() => void search()}
      >
        {loading ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Search size={17} />
        )}
        查询并生成卡片
      </button>

      {draft ? (
        <div className="direct-preview">
          <span className="part-of-speech">
            {draft.contentType === "sentence"
              ? "整句直译"
              : draft.source === "dictionary"
                ? "词典匹配"
                : "在线翻译"}
          </span>
          <strong>{draft.english}</strong>
          <PronounceRow
            word={draft.english}
            fallbackPhonetic={draft.phonetic}
          />
          <p>{draft.chinese}</p>
          {draft.target && draft.sentence ? (
            <div className="cloze-preview">
              {draft.sentence.replace(
                new RegExp(
                  draft.target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "i"
                ),
                "_____"
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="secondary-button wide"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            保存为卡片
          </button>
        </div>
      ) : null}
    </section>
  );
}
