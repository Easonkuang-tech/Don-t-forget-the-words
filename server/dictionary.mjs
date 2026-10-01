import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
// 允许通过 DATA_DIR 环境变量指向其它目录（云端部署 / 持久磁盘挂载）
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(rootDir, "data");
const databasePath = path.join(dataDir, "ecdict.sqlite");
const seedPath = path.join(dataDir, "seed-dictionary.json");

let database;
let seedEntries;

function loadSeedEntries() {
  if (!seedEntries) {
    seedEntries = JSON.parse(readFileSync(seedPath, "utf8"));
  }
  return seedEntries;
}

function openDatabase() {
  if (!existsSync(databasePath)) {
    return null;
  }

  if (!database) {
    database = new DatabaseSync(databasePath, { readOnly: true });
  }

  return database;
}

function normalizeEntry(row) {
  return {
    word: row.word ?? "",
    phonetic: row.phonetic ?? "",
    definition: row.definition ?? "",
    translation: row.translation ?? "",
    pos: row.pos ?? "",
    collins: row.collins ?? "",
    oxford: row.oxford ?? "",
    tag: row.tag ?? "",
    bnc: row.bnc ?? "",
    frq: row.frq ?? "",
    exchange: row.exchange ?? "",
    detail: row.detail ?? "",
    audio: row.audio ?? ""
  };
}

export function lookupWord(input) {
  const word = String(input ?? "").trim();
  if (!word) {
    return { found: false, query: word, entries: [], suggestions: [] };
  }

  const db = openDatabase();
  if (db) {
    const exact = db
      .prepare(
        "SELECT * FROM entries WHERE word = ? COLLATE NOCASE LIMIT 8"
      )
      .all(word)
      .map(normalizeEntry);

    if (exact.length) {
      return { found: true, query: word, entries: exact, suggestions: [] };
    }

    const suggestions = db
      .prepare(
        "SELECT word FROM entries WHERE word LIKE ? COLLATE NOCASE ORDER BY length(word) LIMIT 8"
      )
      .all(`${word}%`)
      .map((item) => item.word);

    return { found: false, query: word, entries: [], suggestions };
  }

  const entries = loadSeedEntries();
  const lower = word.toLocaleLowerCase("en");
  const exact = entries.filter(
    (entry) => entry.word.toLocaleLowerCase("en") === lower
  );

  return { found: exact.length > 0, query: word, entries: exact, suggestions: [] };
}

export function getDictionaryStatus() {
  const db = openDatabase();
  if (!db) {
    return {
      source: "seed",
      databasePath,
      entryCount: loadSeedEntries().length,
      fullDictionary: false
    };
  }

  const row = db.prepare("SELECT COUNT(*) AS count FROM entries").get();
  return {
    source: "ecdict",
    databasePath,
    entryCount: Number(row?.count ?? 0),
    fullDictionary: true
  };
}

export function closeDictionary() {
  if (database) {
    database.close();
    database = undefined;
  }
}
