import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const runtimeModules =
  "C:/Users/来自火星的Yaxley/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/";
const require = createRequire(runtimeModules);
const { chromium } = require("playwright");
const rootDir = process.cwd();
const artifactsDir = path.join(rootDir, ".artifacts");
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
mkdirSync(artifactsDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(`console: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  errors.push(`pageerror: ${error.message}`);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("进入记忆库", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "login-desktop.png"),
    fullPage: true
  });
  await page.getByPlaceholder("例如：Yaxley").fill("Yaxley");
  await page.getByPlaceholder("输入本地口令").fill("reploop-local");
  await page.getByRole("button", { name: "进入 RepLoop" }).click();
  await page.getByText("今日记忆", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "home-desktop.png"),
    fullPage: true
  });

  await page.getByRole("button", { name: "发现" }).click();
  await page.getByPlaceholder("搜索单词、词伙或英文句子").fill("corporate");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByText("词典结果", { exact: true }).waitFor();
  await page.getByRole("button", { name: "加入卡组" }).click();
  await page.getByText(/已加入/).waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "search-created.png"),
    fullPage: true
  });

  await page.getByRole("button", { name: "创建卡片" }).click();
  await page.getByPlaceholder("例如：consider").fill("balance");
  await page.locator(".dictionary-card").waitFor();
  await page
    .getByPlaceholder("请输入包含 balance 的完整句子")
    .fill("Please check your account balance before you leave.");
  await page.getByRole("button", { name: "保存单词卡片" }).click();
  await page.getByText("卡片已保存", { exact: true }).waitFor();

  await page.getByRole("button", { name: "首页" }).click();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("radio", { name: "中→英" }).click();
  await page.getByRole("button", { name: "进入队列" }).click();
  for (let index = 0; index < 2; index += 1) {
    await page.getByText("中文释义", { exact: true }).waitFor();
    const prompt = await page.locator(".chinese-prompt h1").textContent();
    await page
      .getByPlaceholder("输入英文单词或词伙")
      .fill(/平衡|相等|差额/.test(prompt ?? "") ? "balance" : "corporate");
    await page.getByRole("button", { name: "提交答案" }).click();
    await page.getByText("回答正确", { exact: true }).waitFor();
    await page.getByRole("button", { name: /良好/ }).click();
  }
  await page.getByText("这一轮结束了", { exact: true }).waitFor();
  await page.getByRole("button", { name: "返回首页" }).click();

  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("radio", { name: "无序版" }).click();
  await page.getByRole("radio", { name: "挖空" }).click();
  await page.getByRole("button", { name: "进入队列" }).click();
  for (let index = 0; index < 2; index += 1) {
    if (await page.locator(".cloze-blank").count()) {
      await page.locator(".cloze-blank").click();
      await page.getByLabel("填写缺失的英文").fill("balance");
    } else {
      await page.getByText("中文释义", { exact: true }).waitFor();
      const prompt = await page.locator(".chinese-prompt h1").textContent();
      await page
        .getByPlaceholder("输入英文单词或词伙")
        .fill(/平衡|相等|差额/.test(prompt ?? "") ? "balance" : "corporate");
    }
    await page.getByRole("button", { name: "提交答案" }).click();
    await page.getByText("回答正确", { exact: true }).waitFor();
    await page.getByRole("button", { name: /良好/ }).click();
  }
  await page.getByText("这一轮结束了", { exact: true }).waitFor();
  await page.getByRole("button", { name: "返回首页" }).click();

  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("radio", { name: "无序版" }).click();
  await page.getByRole("radio", { name: "选择" }).click();
  await page.getByRole("button", { name: "进入队列" }).click();
  for (let index = 0; index < 2; index += 1) {
    const prompt = await page.locator(".english-prompt h1").textContent();
    await page
      .getByRole("button", {
        name: prompt?.includes("balance") ? /余额|平衡/ : /社团的/
      })
      .click();
    await page.getByText("回答正确", { exact: true }).waitFor();
    await page.getByRole("button", { name: /良好/ }).click();
  }
  await page.getByText("这一轮结束了", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "session-summary.png"),
    fullPage: true
  });

  await page.getByRole("button", { name: "返回首页" }).click();
  await page.getByRole("button", { name: "统计" }).click();
  await page.getByText("未来一周复习量", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "stats-desktop.png"),
    fullPage: true
  });

  await page.getByRole("button", { name: "我的" }).click();
  await page.getByText("记忆库").waitFor();
  await page.screenshot({
    path: path.join(artifactsDir, "profile-desktop.png"),
    fullPage: true
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出备份" }).click()
  ]);
  const backupBuffer = readFileSync(await download.path());
  await page.locator('input[type="file"]').setInputFiles({
    name: "reploop-backup.json",
    mimeType: "application/json",
    buffer: backupBuffer
  });
  await page.getByText("数据导入完成", { exact: true }).waitFor();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.getByText("今日记忆", { exact: true }).waitFor();
  await mobile.screenshot({
    path: path.join(artifactsDir, "home-mobile.png"),
    fullPage: false
  });
  await mobile.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const navBox = await mobile.locator(".bottom-nav").boundingBox();
  const practiceBox = await mobile.locator(".quick-row").boundingBox();
  const horizontalOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  const overlap =
    Boolean(navBox && practiceBox) &&
    practiceBox.y + practiceBox.height > navBox.y + 1;
  await mobile.screenshot({
    path: path.join(artifactsDir, "home-mobile-bottom.png"),
    fullPage: false
  });

  const loginMobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  const loginMobile = await loginMobileContext.newPage();
  await loginMobile.goto(baseUrl, {
    waitUntil: "networkidle"
  });
  await loginMobile.getByText("进入记忆库", { exact: true }).waitFor();
  const loginMobileOverflow = await loginMobile.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  await loginMobile.screenshot({
    path: path.join(artifactsDir, "login-mobile.png"),
    fullPage: false
  });
  await loginMobileContext.close();

  const staticContext = await browser.newContext({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1
  });
  await staticContext.route("**/api/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<html>Not found</html>"
    })
  );
  const staticPage = await staticContext.newPage();
  await staticPage.goto(baseUrl, {
    waitUntil: "networkidle"
  });
  await staticPage.getByPlaceholder("例如：Yaxley").fill("StaticUser");
  await staticPage.getByPlaceholder("输入本地口令").fill("static-local");
  await staticPage.getByRole("button", { name: "进入 RepLoop" }).click();
  await staticPage.getByRole("button", { name: "创建卡片" }).click();
  await staticPage.getByRole("radio", { name: "英文直查" }).click();
  await staticPage.getByPlaceholder("单词、词伙或完整句子").fill("Outperform them");
  await staticPage.getByRole("button", { name: "查询并生成卡片" }).click();
  await staticPage.getByText("在线翻译", { exact: true }).waitFor({
    timeout: 20_000
  });
  await staticPage.getByText("超越他们", { exact: true }).waitFor();
  await staticPage.screenshot({
    path: path.join(artifactsDir, "static-fallback.png"),
    fullPage: true
  });
  await staticContext.close();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByText("进入记忆库", { exact: true }).waitFor();

  console.log(
    JSON.stringify(
      {
        ok: true,
        title: await page.title(),
        mobile: {
          horizontalOverflow,
          bottomOverlap: overlap,
          loginOverflow: loginMobileOverflow
        },
        backupRoundTrip: true,
        staticApiFallback: true,
        logout: true,
        errors,
        screenshots: [
          "home-desktop.png",
          "login-desktop.png",
          "search-created.png",
          "session-summary.png",
          "stats-desktop.png",
          "profile-desktop.png",
          "home-mobile.png",
          "home-mobile-bottom.png",
          "login-mobile.png",
          "static-fallback.png"
        ]
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
