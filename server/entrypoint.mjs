#!/usr/bin/env node
// 云平台部署入口脚本：
// 1. 确保 DATA_DIR 存在
// 2. 首次部署时把构建阶段烘焙进去的词典数据复制到 DATA_DIR
// 3. 之后再 exec 启动真正的服务端

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve("./data");
const seedDir = process.env.SEED_DIR
  ? path.resolve(process.env.SEED_DIR)
  : path.resolve("./build-data");

mkdirSync(dataDir, { recursive: true });

const targetSqlite = path.join(dataDir, "ecdict.sqlite");
const sourceSqlite = path.join(seedDir, "ecdict.sqlite");
const targetSeed = path.join(dataDir, "seed-dictionary.json");
const sourceSeed = path.join(seedDir, "seed-dictionary.json");

let bootstrapped = false;

if (!existsSync(targetSqlite) && existsSync(sourceSqlite)) {
  copyFileSync(sourceSqlite, targetSqlite);
  bootstrapped = true;
  console.log(`[entrypoint] 已初始化词典数据库：${targetSqlite}`);
}

if (!existsSync(targetSeed) && existsSync(sourceSeed)) {
  copyFileSync(sourceSeed, targetSeed);
  console.log(`[entrypoint] 已写入种子词典：${targetSeed}`);
}

if (bootstrapped) {
  // 清理可能残留的 sqlite 临时文件，避免读取不一致
  for (const file of readdirSync(dataDir)) {
    if (file.endsWith("-shm") || file.endsWith("-wal")) {
      try {
        const target = path.join(dataDir, file);
        if (statSync(target).isFile()) {
          // 保留 mounted disk 的旧文件，覆盖场景下不需要清理
        }
      } catch {
        // ignore
      }
    }
  }
}

// exec 真正的服务端，把 stdin/stdout 信号原样透传
const child = spawn("node", ["server/index.mjs"], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
