import { spawn } from "node:child_process";

const commands = [
  ["--watch", "server/index.mjs"],
  ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]
];

const children = commands.map((args) =>
  spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit"
  })
);

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exit(code);
    }
  });
}
