import { cpSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const extensionDir = path.join(rootDir, "extension");
const distDir = path.join(extensionDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const build = spawnSync(
  process.execPath,
  ["./node_modules/typescript/bin/tsc", "--project", "extension/tsconfig.json"],
  {
    cwd: rootDir,
    stdio: "inherit"
  }
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const bundle = spawnSync(
  process.execPath,
  ["./node_modules/vite/bin/vite.js", "build", "--config", "extension/vite.config.ts"],
  {
    cwd: rootDir,
    stdio: "inherit"
  }
);

if (bundle.status !== 0) {
  process.exit(bundle.status ?? 1);
}

cpSync(path.join(extensionDir, "manifest.json"), path.join(distDir, "manifest.json"));
cpSync(path.join(extensionDir, "content.css"), path.join(distDir, "content.css"));
cpSync(path.join(extensionDir, "icons"), path.join(distDir, "icons"), {
  recursive: true
});

console.log(`Edge extension built: ${distDir}`);
