import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  closeDictionary,
  getDictionaryStatus,
  lookupWord
} from "./dictionary.mjs";
import { translateEnglish } from "./translation.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const distDir = path.join(rootDir, "dist");
const shouldOpen = process.argv.includes("--open");
const basePort = Number(process.env.PORT ?? 4173);
// 默认监听全部接口，云端部署（Render / Railway / Docker）需要 0.0.0.0
const host = process.env.HOST ?? "0.0.0.0";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    dictionary: getDictionaryStatus()
  });
});

app.get("/api/dictionary/status", (_request, response) => {
  response.json(getDictionaryStatus());
});

app.get("/api/dictionary", (request, response) => {
  response.json(lookupWord(request.query.word));
});

app.post("/api/translate", async (request, response) => {
  try {
    const result = await translateEnglish(request.body?.text);
    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "翻译失败"
    });
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method !== "GET") {
      next();
      return;
    }
    response.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.use((_request, response) => {
    response
      .status(503)
      .send("前端尚未构建。开发时请运行 npm run dev，本地启动请运行 npm run local。");
  });
}

let server;

function listen(port, listenHost) {
  return new Promise((resolve, reject) => {
    const candidate = app.listen(port, listenHost);
    candidate.once("listening", () => resolve(candidate));
    candidate.once("error", reject);
  });
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
}

async function start() {
  let lastError;

  for (let port = basePort; port < basePort + 20; port += 1) {
    try {
      server = await listen(port, host);
      break;
    } catch (error) {
      lastError = error;
      if (error?.code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  if (!server) {
    throw lastError ?? new Error("无法找到可用端口");
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : basePort;
  const displayHost =
    host === "0.0.0.0" || host === "::"
      ? "localhost"
      : host;
  const url = `http://${displayHost}:${port}`;
  console.log(`英语记忆网站已启动：${url}`);
  console.log(`数据目录：${process.env.DATA_DIR ?? path.join(rootDir, "data")}`);

  if (shouldOpen) {
    openBrowser(url);
  }
}

function shutdown() {
  closeDictionary();
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
