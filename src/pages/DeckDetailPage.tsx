import {
  ArrowLeft,
  Check,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Play,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PronounceRow } from "../components/PronounceRow";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  db,
  deleteCard,
  updateCard
} from "../lib/db";
import {
  cardImageFields,
  findCardImage,
  uploadCardImage
} from "../lib/cardImage";
import { dateKey } from "../lib/format";
import { deckLanguage, languageLabel, languageName } from "../lib/language";
import type { Card, ContentType, LanguageCode } from "../types";

interface DeckDetailPageProps {
  deckId: string;
  onBack: () => void;
  onStartReview: (deckId: string) => void;
}

type CardFilter = "all" | ContentType;

const filterOptions: { value: CardFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "word", label: "单词" },
  { value: "phrase", label: "词伙" },
  { value: "sentence", label: "句子" }
];

function normalizeMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function DeckDetailPage({
  deckId,
  onBack,
  onStartReview
}: DeckDetailPageProps) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const project = useLiveQuery(
    async () => (deck ? db.projects.get(deck.projectId) : undefined),
    [deck?.projectId]
  );
  const cards =
    useLiveQuery(
      () =>
        db.cards
          .where("deckId")
          .equals(deckId)
          .toArray()
          .then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt)),
      [deckId],
      [] as Card[]
    ) ?? [];

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");
  const [editing, setEditing] = useState<Card | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const learningLanguage = deckLanguage(deck);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return cards.filter((card) => {
      if (filter !== "all" && card.contentType !== filter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        card.english.toLocaleLowerCase("zh-CN").includes(keyword) ||
        card.chinese.toLocaleLowerCase("zh-CN").includes(keyword) ||
        card.tags.some((tag) =>
          tag.toLocaleLowerCase("zh-CN").includes(keyword)
        )
      );
    });
  }, [cards, filter, query]);

  const selectedCards = useMemo(
    () => cards.filter((card) => selected.has(card.id)),
    [cards, selected]
  );

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleBatchMode() {
    setBatchMode((current) => !current);
    setSelected(new Set());
    setBatchNotice("");
  }

  async function findImagesForSelected() {
    if (!selectedCards.length || batching) {
      return;
    }
    setBatching(true);
    let completed = 0;
    let skipped = 0;
    try {
      for (const card of selectedCards) {
        if (card.imageOrigin === "user") {
          skipped += 1;
          continue;
        }
        setBatchNotice(`正在查找 ${completed + 1}/${selectedCards.length}：${card.english}`);
        const image = await findCardImage({
          word: card.english,
          meaning: card.chinese,
          definition:
            card.definitionEn || card.definitionZh || card.chinese,
          language: learningLanguage
        });
        if (image.found) {
          await updateCard(card.id, cardImageFields(image));
        }
        completed += 1;
      }
      setBatchNotice(
        `批量找图完成：处理 ${completed} 张${skipped ? `，跳过 ${skipped} 张用户图片` : ""}`
      );
    } finally {
      setBatching(false);
    }
  }

  async function uploadImagesForSelected(files: FileList | null) {
    if (!files?.length || !selectedCards.length || batching) {
      return;
    }
    setBatching(true);
    const pending = [...selectedCards];
    const unmatched: string[] = [];
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        const fileKey = normalizeMatch(file.name.replace(/\.[^.]+$/, ""));
        let index = pending.findIndex(
          (card) =>
            normalizeMatch(card.english) === fileKey ||
            normalizeMatch(card.chinese) === fileKey
        );
        if (index < 0 && files.length === selectedCards.length) {
          index = 0;
        }
        if (index < 0) {
          unmatched.push(file.name);
          continue;
        }
        const [card] = pending.splice(index, 1);
        setBatchNotice(`正在上传：${card.english}`);
        try {
          await updateCard(card.id, await uploadCardImage(file));
          uploaded += 1;
        } catch {
          unmatched.push(file.name);
        }
      }
      setBatchNotice(
        `批量上传完成：${uploaded} 张${unmatched.length ? `，未匹配 ${unmatched.length} 张` : ""}`
      );
    } finally {
      setBatching(false);
      if (uploadRef.current) {
        uploadRef.current.value = "";
      }
    }
  }

  if (!deck) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <button
            type="button"
            className="icon-button"
            onClick={onBack}
            aria-label="返回"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <p className="eyebrow">卡组</p>
            <h1>已删除</h1>
          </div>
        </header>
        <EmptyState
          title="找不到这个卡组"
          description="卡组可能已经被删除，回到首页继续。"
          action={
            <button
              type="button"
              className="primary-button"
              onClick={onBack}
            >
              返回首页
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <button
          type="button"
          className="icon-button"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <p className="eyebrow">{project?.name ?? "项目"}</p>
          <h1>{deck.name}</h1>
        </div>
        <button
          type="button"
          className="icon-button primary"
          onClick={() => onStartReview(deck.id)}
          aria-label="开始复习"
          title="开始复习"
        >
          <Play size={19} fill="currentColor" />
        </button>
      </header>

      <section className="deck-detail-summary">
        <div>
          <strong>{cards.length}</strong>
          <span>张卡片</span>
        </div>
        <div>
          <strong>
            {cards.filter((card) => card.reviewCount > 0).length}
          </strong>
          <span>已复习</span>
        </div>
        <div>
          <strong>
            {cards.filter((card) => card.reviewCount === 0).length}
          </strong>
          <span>未复习</span>
        </div>
      </section>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => void uploadImagesForSelected(event.target.files)}
      />

      <section className="deck-detail-toolbar">
        <div className="input-with-status">
          <Search size={17} className="search-glyph" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${languageLabel(learningLanguage)}、中文或标签`}
            spellCheck={false}
          />
        </div>
        <SegmentedControl
          value={filter}
          ariaLabel="卡片类型筛选"
          options={filterOptions}
          onChange={(value) => setFilter(value)}
        />
        <button
          type="button"
          className="secondary-button batch-image-toggle"
          onClick={toggleBatchMode}
        >
          <ImagePlus size={16} />
          {batchMode ? "退出批量" : "批量配图"}
        </button>
      </section>

      {batchMode ? (
        <section className="batch-image-bar">
          <div className="batch-image-summary">
            <strong>已选 {selectedCards.length} 张</strong>
            <span>用户已上传的图片会自动跳过自动找图</span>
          </div>
          <div className="batch-image-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setSelected(new Set(filtered.map((card) => card.id)))}
              disabled={batching}
            >
              全选
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setSelected(new Set())}
              disabled={batching}
            >
              清空
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void findImagesForSelected()}
              disabled={!selectedCards.length || batching}
            >
              {batching ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <ImagePlus size={15} />
              )}
              批量找图
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => uploadRef.current?.click()}
              disabled={!selectedCards.length || batching}
            >
              <Upload size={15} />
              批量上传
            </button>
          </div>
          <small>批量上传时，文件名优先匹配单词或中文释义。</small>
        </section>
      ) : null}

      {batchNotice ? <div className="notice-banner">{batchNotice}</div> : null}

      {!filtered.length ? (
        <EmptyState
          title={cards.length ? "没有匹配的卡片" : "这个卡组还是空的"}
          description={
            cards.length
              ? "试着改一下关键词或切换类型筛选。"
              : "回到首页创建一张新卡片，或者直接开始复习导入。"
          }
        />
      ) : (
        <ul className="card-list">
          {filtered.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              language={learningLanguage}
              selectable={batchMode}
              selected={selected.has(card.id)}
              onToggleSelected={() => toggleSelected(card.id)}
              onEdit={() => setEditing(card)}
              onDelete={async () => {
                if (window.confirm(`删除卡片"${card.english}"？`)) {
                  await deleteCard(card.id);
                }
              }}
            />
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title="编辑卡片"
        onClose={() => setEditing(null)}
        actions={
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={async () => {
                if (!editing) {
                  return;
                }
                const trimmed: Partial<Card> = {
                  contentType: editing.contentType,
                  english: editing.english,
                  chinese: editing.chinese,
                  target: editing.target,
                  sentence: editing.sentence,
                  sentenceTranslation: editing.sentenceTranslation,
                  phonetic: editing.phonetic,
                  definitionEn: editing.definitionEn,
                  definitionZh: editing.definitionZh,
                  partOfSpeech: editing.partOfSpeech,
                  tags: editing.tags
                };
                await updateCard(editing.id, trimmed);
                setEditing(null);
              }}
            >
              保存修改
            </button>
          </>
        }
      >
        {editing ? (
          <CardEditor
            card={editing}
            language={learningLanguage}
            onChange={(next) => setEditing(next)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function CardRow({
  card,
  language,
  selectable,
  selected,
  onToggleSelected,
  onEdit,
  onDelete
}: {
  card: Card;
  language: LanguageCode;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const labelMap: Record<ContentType, string> = {
    word: "单词",
    phrase: "词伙",
    sentence: "句子"
  };

  return (
    <li className={`card-list-item${selectable ? " is-selectable" : ""}`}>
      {selectable ? (
        <button
          type="button"
          className={`card-select-toggle${selected ? " is-selected" : ""}`}
          onClick={onToggleSelected}
          aria-label={selected ? `取消选择 ${card.english}` : `选择 ${card.english}`}
          aria-pressed={selected}
        >
          {selected ? <Check size={16} /> : null}
        </button>
      ) : null}
      <button
        type="button"
        className="card-list-main"
        onClick={selectable ? onToggleSelected : onEdit}
        aria-pressed={selectable ? selected : undefined}
      >
        <div className="card-list-head">
          <span className="part-of-speech">{labelMap[card.contentType]}</span>
          {card.phonetic ? (
            <small className="card-list-phonetic">/{card.phonetic}/</small>
          ) : null}
          {card.reviewCount > 0 ? (
            <small className="card-list-level">
              Lv.{card.level} · 复习 {card.reviewCount} 次
            </small>
          ) : (
            <small className="card-list-level muted">未复习</small>
          )}
        </div>
        <strong>
          {card.english || `（未填写${languageLabel(language)}）`}
        </strong>
        {card.imageThumbUrl || card.imageUrl ? (
          <span className="card-list-image">
            <img
              src={card.imageThumbUrl || card.imageUrl}
              alt={`${card.english} 的配图`}
              loading="lazy"
            />
          </span>
        ) : null}
        <p>{card.chinese || "（未填写中文）"}</p>
        {card.sentence ? (
          <p className="card-list-sentence">{card.sentence}</p>
        ) : null}
        {card.tags.length ? (
          <div className="card-list-tags">
            {card.tags.map((tag, index) => (
              <span
                className="tag-chip"
                key={`${tag}-${index}`}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      <PronounceRow
        word={card.english}
        language={language}
        compact
        showPhonetic={false}
        className="card-list-pronounce"
      />
      <div className="row-actions">
        {selectable ? null : (
          <>
            <button
              type="button"
              className="icon-button compact"
              onClick={onEdit}
              aria-label={`编辑 ${card.english}`}
              title="编辑"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="icon-button compact danger"
              onClick={onDelete}
              aria-label={`删除 ${card.english}`}
              title="删除"
            >
              <Trash2 size={15} />
            </button>
            <span className="card-list-chevron" aria-hidden="true">
              <ChevronRight size={16} />
            </span>
          </>
        )}
      </div>
      <small className="card-list-updated">
        最近更新 {dateKey(card.updatedAt)}
      </small>
    </li>
  );
}

function CardEditor({
  card,
  language,
  onChange
}: {
  card: Card;
  language: LanguageCode;
  onChange: (next: Card) => void;
}) {
  const set = <K extends keyof Card>(key: K, value: Card[K]) => {
    onChange({ ...card, [key]: value });
  };

  return (
    <div className="form-stack">
      <label className="field">
        <span>内容类型</span>
        <select
          value={card.contentType}
          onChange={(event) =>
            set("contentType", event.target.value as ContentType)
          }
        >
          <option value="word">单词</option>
          <option value="phrase">词伙</option>
          <option value="sentence">句子</option>
        </select>
      </label>

      <label className="field">
        <span>{languageLabel(language)}</span>
        <input
          value={card.english}
          onChange={(event) => set("english", event.target.value)}
          placeholder={`${languageLabel(language)}内容`}
        />
      </label>

      <label className="field">
        <span>中文</span>
        <input
          value={card.chinese}
          onChange={(event) => set("chinese", event.target.value)}
          placeholder="中文释义"
        />
      </label>

      <div className="two-column-fields">
        <label className="field">
          <span>音标</span>
          <input
            value={card.phonetic}
            onChange={(event) => set("phonetic", event.target.value)}
            placeholder="例如：/kənˈsɪdər/"
          />
        </label>
        <label className="field">
          <span>词性</span>
          <input
            value={card.partOfSpeech}
            onChange={(event) => set("partOfSpeech", event.target.value)}
            placeholder="例如：v. / n."
          />
        </label>
      </div>

      <div className="two-column-fields">
        <label className="field">
          <span>{languageName(language)}释义</span>
          <input
            value={card.definitionEn}
            onChange={(event) => set("definitionEn", event.target.value)}
          />
        </label>
        <label className="field">
          <span>中文释义</span>
          <input
            value={card.definitionZh}
            onChange={(event) => set("definitionZh", event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>挖空目标</span>
        <input
          value={card.target}
          onChange={(event) => set("target", event.target.value)}
          placeholder="用于挖空题型的关键词，可选"
        />
      </label>

      <label className="field">
        <span>例句</span>
        <textarea
          value={card.sentence}
          onChange={(event) => set("sentence", event.target.value)}
          rows={3}
        />
      </label>

      <label className="field">
        <span>例句中文</span>
        <textarea
          value={card.sentenceTranslation}
          onChange={(event) =>
            set("sentenceTranslation", event.target.value)
          }
          rows={2}
        />
      </label>

      <label className="field">
        <span>标签（用 / 或空格分隔）</span>
        <input
          value={card.tags.join(" / ")}
          onChange={(event) =>
            set(
              "tags",
              event.target.value
                .split(/[\s/、，]+/)
                .map((tag) => tag.trim())
                .filter(Boolean)
            )
          }
          placeholder="例如：雅思 / 写作"
        />
      </label>
    </div>
  );
}
