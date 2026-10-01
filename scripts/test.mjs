import { spawn } from "node:child_process";

const args = ["./node_modules/vitest/vitest.mjs"];
if (process.argv.includes("--watch")) {
  args.push("dev");
} else {
  args.push("run");
}

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  stdio: "inherit"
});

child.on("exit", (code) => process.exit(code ?? 1));
