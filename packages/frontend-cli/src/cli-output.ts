export type CliOutput = {
  line(text: string): void;
  raw(text: string): void;
  json(value: unknown): void;
};

import { AppError } from "@rubydogjp/openkk-driver";

export class CliUsageError extends Error {}

export function cliRefusal(messageForUser: string): AppError {
  return new AppError({
    messageForDeveloper: "cli: the command was refused in the current state",
    messageForUser,
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

export function createCliOutput(write: (text: string) => void): CliOutput {
  return {
    line: (text) => write(`${text}\n`),
    raw: (text) => write(text),
    json: (value) => write(`${JSON.stringify(value, null, 2)}\n`),
  };
}
