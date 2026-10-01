import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const dictionaryPath = path.join(rootDir, "data", "ecdict.sqlite");

if (!existsSync(dictionaryPath)) {
  const dictionary = spawnSync(
    process.execPath,
    ["./scripts/setup-dictionary.mjs"],
    {
      cwd: rootDir,
      stdio: "inherit"
    }
  );
  if (dictionary.status !== 0) {
    process.exit(dictionary.status ?? 1);
  }
}

const build = spawnSync(process.execPath, ["./scripts/build.mjs"], {
  cwd: rootDir,
  stdio: "inherit"
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    HOST: "0.0.0.0",
    PORT: process.env.PORT ?? "4173"
  },
  stdio: "inherit"
});

server.on("exit", (code) => process.exit(code ?? 0));
