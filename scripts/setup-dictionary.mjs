import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync
} from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { parse } from "csv-parse";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const dataDir = path.join(rootDir, "data");
const csvPath = path.join(dataDir, "ecdict.csv");
const databasePath = path.join(dataDir, "ecdict.sqlite");
const useMini = process.argv.includes("--mini");
const sourceUrl =
  process.env.ECDICT_URL ??
  (useMini
    ? "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.mini.csv"
    : "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv");

mkdirSync(dataDir, { recursive: true });

async function downloadCsv() {
  if (existsSync(csvPath) && !useMini) {
    console.log(`复用已有文件：${csvPath}`);
    return;
  }

  console.log(`下载 ECDICT：${sourceUrl}`);
  const response = await fetch(sourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(csvPath)
  );
}

function insertRows(database, rows) {
  const insert = database.prepare(`
    INSERT OR REPLACE INTO entries (
      word, phonetic, definition, translation, pos, collins, oxford,
      tag, bnc, frq, exchange, detail, audio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    for (const row of rows) {
      insert.run(
        row.word ?? "",
        row.phonetic ?? "",
        row.definition ?? "",
        row.translation ?? "",
        row.pos ?? "",
        Number(row.collins ?? 0) || 0,
        Number(row.oxford ?? 0) || 0,
        row.tag ?? "",
        Number(row.bnc ?? 0) || 0,
        Number(row.frq ?? 0) || 0,
        row.exchange ?? "",
        row.detail ?? "",
        row.audio ?? ""
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function buildDatabase() {
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL COLLATE NOCASE,
      phonetic TEXT,
      definition TEXT,
      translation TEXT,
      pos TEXT,
      collins INTEGER,
      oxford INTEGER,
      tag TEXT,
      bnc INTEGER,
      frq INTEGER,
      exchange TEXT,
      detail TEXT,
      audio TEXT
    );
    CREATE INDEX idx_entries_word ON entries(word COLLATE NOCASE);
  `);

  let batch = [];
  let total = 0;

  const csv = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true
    })
  );

  for await (const row of csv) {
    batch.push(row);
    if (batch.length >= 1_000) {
      insertRows(database, batch);
      total += batch.length;
      batch = [];
      process.stdout.write(`\r已导入 ${total} 条`);
    }
  }

  if (batch.length) {
    insertRows(database, batch);
    total += batch.length;
  }

  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close();
  console.log(`\n词典数据库已生成：${databasePath}`);
  console.log(`词条数：${total}`);
}

await downloadCsv();
await buildDatabase();
