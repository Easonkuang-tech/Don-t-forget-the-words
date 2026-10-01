import { spawnSync } from "node:child_process";

const commands = [
  ["./node_modules/typescript/bin/tsc", "--noEmit"],
  ["./node_modules/vite/bin/vite.js", "build"]
];

for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
