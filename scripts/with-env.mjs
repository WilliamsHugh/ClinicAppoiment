import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [envFile, command, ...args] = process.argv.slice(2);
if (!envFile || !command) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [args...]");
  process.exit(2);
}

const file = resolve(envFile);
if (existsSync(file)) process.loadEnvFile(file);

// npm scripts use cmd.exe on Windows, where npm is a .cmd file. Run its CLI
// through Node so the same root script works on Windows and Unix.
const npmCli = command === "npm" ? process.env.npm_execpath : undefined;
if (command === "npm" && !npmCli) {
  console.error("npm_execpath is required when running npm through this helper");
  process.exit(2);
}
const executable = npmCli ? process.execPath : command;
const commandArgs = npmCli ? [npmCli, ...args] : args;
const result = spawnSync(executable, commandArgs, { env: process.env, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(127);
}
process.exit(result.status ?? 1);
