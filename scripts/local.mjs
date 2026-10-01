import { spawn, spawnSync } from "node:child_process";

const build = spawnSync(
  process.execPath,
  ["./scripts/build.mjs"],
  {
    cwd: process.cwd(),
    stdio: "inherit"
  }
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawn(
  process.execPath,
  ["server/index.mjs", "--open"],
  {
    cwd: process.cwd(),
    stdio: "inherit"
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
