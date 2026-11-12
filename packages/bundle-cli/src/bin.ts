#!/usr/bin/env node
import { runOpenkkCli } from "./openkk-cli.js";

process.exitCode = await runOpenkkCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  env: (name) => process.env[name] ?? null,
  now: () => new Date(),
});
