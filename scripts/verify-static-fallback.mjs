import { createRequire } from "node:module";

const runtimeModules =
  "C:/Users/来自火星的Yaxley/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/";
const require = createRequire(runtimeModules);
const { chromium } = require("playwright");
const baseUrl =
  process.env.BASE_URL ??
  "https://8dab7e5840e54cd59cabc57a4f0a59b3.app.workbuddy.host";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});
const context = await browser.newContext({
  viewport: { width: 430, height: 900 }
});
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("进入记忆库", { exact: true }).waitFor();
  await page.getByPlaceholder("例如：Yaxley").fill("WorkBuddyTest");
  await page.getByPlaceholder("输入本地口令").fill("remote-test");
  await page.getByRole("button", { name: "进入 RepLoop" }).click();
  await page.getByRole("button", { name: "创建卡片" }).click();
  await page.getByRole("radio", { name: "英文直查" }).click();
  await page.getByPlaceholder("单词、词伙或完整句子").fill("Outperform them");
  await page.getByRole("button", { name: "查询并生成卡片" }).click();
  await page.getByText("在线翻译", { exact: true }).waitFor({
    timeout: 25_000
  });

  const body = await page.locator("body").innerText();
  const unexpectedError = body.includes(
    "The string did not match the expected pattern"
  );

  console.log(
    JSON.stringify(
      {
        ok: !unexpectedError,
        baseUrl,
        translated: body.includes("超越他们") || body.includes("超越"),
        unexpectedError,
        consoleErrors: errors
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
